"""Folio API. Supabase credentials live only in backend/.env."""
import os
import re
from typing import Any
from urllib.parse import urlencode
import httpx
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

load_dotenv()
SUPABASE_URL=os.environ.get('SUPABASE_URL','').rstrip('/')
SUPABASE_SERVICE_ROLE_KEY=os.environ.get('SUPABASE_SERVICE_ROLE_KEY','')
FRONTEND_URL=os.environ.get('FRONTEND_URL','http://127.0.0.1:5173')
app=FastAPI(title='Folio API')
app.add_middleware(CORSMiddleware,allow_origins=[FRONTEND_URL,'http://localhost:5173'],allow_credentials=False,allow_methods=['*'],allow_headers=['*'])

def configured():
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY: raise HTTPException(503,'Supabase is not configured on the backend')
def admin_headers(): return {'apikey':SUPABASE_SERVICE_ROLE_KEY,'Authorization':f'Bearer {SUPABASE_SERVICE_ROLE_KEY}','Content-Type':'application/json'}
async def user(authorization:str|None=Header(default=None)):
    configured()
    if not authorization or not authorization.startswith('Bearer '): raise HTTPException(401,'Sign in required')
    async with httpx.AsyncClient() as client:
        r=await client.get(f'{SUPABASE_URL}/auth/v1/user',headers={'apikey':SUPABASE_SERVICE_ROLE_KEY,'Authorization':authorization})
    if r.status_code!=200: raise HTTPException(401,'Session expired')
    return r.json()
async def rest(method:str,path:str,**kwargs):
    headers={**admin_headers(),**kwargs.pop('headers',{})}
    async with httpx.AsyncClient() as client:
        r=await client.request(method,f'{SUPABASE_URL}/rest/v1/{path}',headers=headers,**kwargs)
    if r.status_code>=400: raise HTTPException(r.status_code,r.text)
    return r.json() if r.content else None
async def own_book(book_id:str,uid:str):
    rows=await rest('GET',f'books?id=eq.{book_id}&owner_id=eq.{uid}&select=id')
    if not rows: raise HTTPException(404,'Book not found')

class BookIn(BaseModel): title:str
class ItemIn(BaseModel): kind:str;title:str;position:int=0
class ContentIn(BaseModel): content:str
class CharacterIn(BaseModel): name:str
class CharacterPatch(BaseModel): name:str|None=None;role:str|None=None;description:str|None=None;age:str|None=None;goals:str|None=None;motivation:str|None=None;conflict:str|None=None

@app.get('/health')
def health(): return {'status':'ok'}
@app.get('/auth/google')
def google():
    configured()
    return RedirectResponse(f'{SUPABASE_URL}/auth/v1/authorize?'+urlencode({'provider':'google','redirect_to':f'{FRONTEND_URL}/auth/callback'}))
@app.get('/auth/me')
async def me(u:dict=Depends(user)): return {'id':u['id'],'email':u.get('email',''),'full_name':u.get('user_metadata',{}).get('full_name') or u.get('user_metadata',{}).get('name')}
@app.get('/books')
async def books(u:dict=Depends(user)): return await rest('GET',f'books?owner_id=eq.{u["id"]}&select=*&order=updated_at.desc')
@app.post('/books')
async def create_book(body:BookIn,u:dict=Depends(user)):
    return (await rest('POST','books',json={'title':body.title,'owner_id':u['id']},headers={**admin_headers(),'Prefer':'return=representation'}))[0]
@app.get('/books/{book_id}/items')
async def items(book_id:str,u:dict=Depends(user)):
    await own_book(book_id,u['id']);return await rest('GET',f'manuscript_items?book_id=eq.{book_id}&select=*&order=position.asc')
@app.post('/books/{book_id}/items')
async def create_item(book_id:str,body:ItemIn,u:dict=Depends(user)):
    await own_book(book_id,u['id']);return (await rest('POST','manuscript_items',json={**body.model_dump(),'book_id':book_id},headers={**admin_headers(),'Prefer':'return=representation'}))[0]
@app.patch('/items/{item_id}')
async def update_item(item_id:str,body:ContentIn,u:dict=Depends(user)):
    rows=await rest('GET',f'manuscript_items?id=eq.{item_id}&select=book_id');
    if not rows: raise HTTPException(404,'Item not found')
    await own_book(rows[0]['book_id'],u['id']);return (await rest('PATCH',f'manuscript_items?id=eq.{item_id}',json=body.model_dump(),headers={**admin_headers(),'Prefer':'return=representation'}))[0]

@app.post('/chapters/{item_id}/finish')
async def finish_chapter(item_id:str,u:dict=Depends(user)):
    """Publish an immutable chapter snapshot and promote recurring names to characters."""
    rows=await rest('GET',f'manuscript_items?id=eq.{item_id}&kind=eq.chapter&select=*')
    if not rows: raise HTTPException(404,'Chapter not found')
    chapter=rows[0];await own_book(chapter['book_id'],u['id'])
    plain=re.sub(r'<[^>]+>',' ',chapter.get('content',''))
    names=re.findall(r'\b[A-Z][a-z]{2,}\b',plain)
    ignored={'The','This','That','With','When','Then','They','She','His','Her','For','And','But','Chapter'}
    candidates={name for name in names if name not in ignored and names.count(name)>=2}
    existing=await rest('GET',f'characters?book_id=eq.{chapter["book_id"]}&select=name')
    known={x['name'].casefold() for x in existing}
    created=[]
    for name in sorted(candidates):
        if name.casefold() not in known:
            await rest('POST','characters',json={'book_id':chapter['book_id'],'name':name,'role':'Detected from manuscript'},headers={**admin_headers(),'Prefer':'return=representation'})
            created.append(name)
    post=(await rest('POST','feed_posts',json={'book_id':chapter['book_id'],'chapter_id':item_id,'author_id':u['id'],'title':chapter['title'],'content_snapshot':chapter.get('content','')},headers={**admin_headers(),'Prefer':'return=representation'}))[0]
    return {'post':post,'detected_characters':created}

@app.get('/feed')
async def feed(u:dict=Depends(user)):
    return await rest('GET','feed_posts?select=*&order=published_at.desc&limit=40')
@app.get('/books/{book_id}/characters')
async def characters(book_id:str,u:dict=Depends(user)):
    await own_book(book_id,u['id']);return await rest('GET',f'characters?book_id=eq.{book_id}&select=*&order=name.asc')
@app.post('/books/{book_id}/characters')
async def create_character(book_id:str,body:CharacterIn,u:dict=Depends(user)):
    await own_book(book_id,u['id']);return (await rest('POST','characters',json={**body.model_dump(),'book_id':book_id},headers={**admin_headers(),'Prefer':'return=representation'}))[0]
@app.patch('/characters/{character_id}')
async def update_character(character_id:str,body:CharacterPatch,u:dict=Depends(user)):
    rows=await rest('GET',f'characters?id=eq.{character_id}&select=book_id');
    if not rows: raise HTTPException(404,'Character not found')
    await own_book(rows[0]['book_id'],u['id']);return (await rest('PATCH',f'characters?id=eq.{character_id}',json=body.model_dump(exclude_none=True),headers={**admin_headers(),'Prefer':'return=representation'}))[0]
