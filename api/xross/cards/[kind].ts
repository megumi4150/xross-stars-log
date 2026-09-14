import type { VercelRequest, VercelResponse } from '@vercel/node';

const UPSTREAM = 'https://api.xross-stars.com/v1/cards';
const TIMEOUT_MS = 7_000, MAX_BYTES = 3_000_000, CACHE_MS = 3_600_000, RATE_WINDOW_MS = 60_000, RATE_MAX = 20;
type Kind = 'leader' | 'ace';
type OfficialCard = {
  id:number; name:string; display_card_number:string; image_url?:string; is_ace?:boolean;
  card_type?:{internal_id:string}; card_rarity?:{internal_id:string}; card_color?:{internal_id:string};
};
type OfficialResponse = {cards:OfficialCard[];page_info:{current_page:number;has_next_page:boolean}};
type Card = {id:string;name:string;cardType:'leader'|'ace';imageUrl?:string;isAce:boolean;rarity?:string;color?:string};
const cache = new Map<Kind,{expires:number;cards:Card[]}>(), visitors = new Map<string,{started:number;count:number}>();
const kindIsValid = (value:string): value is Kind => value === 'leader' || value === 'ace';
function normalize(card:OfficialCard, kind:Kind):Card { return {id:card.display_card_number?.split(' ')[0] || String(card.id),name:card.name,cardType:kind,imageUrl:card.image_url,isAce:Boolean(card.is_ace),rarity:card.card_rarity?.internal_id,color:card.card_color?.internal_id}; }
async function fetchPage(page:number):Promise<OfficialResponse> {
  const controller = new AbortController(), timer = setTimeout(()=>controller.abort(), TIMEOUT_MS);
  try {
    // Verified from the official deck builder: these exact query parameters are used with limit=100.
    const url = new URL(UPSTREAM); url.searchParams.set('type','leader,attack,memoria,tactics'); url.searchParams.set('page',String(page)); url.searchParams.set('limit','100');
    const response = await fetch(url,{method:'GET',headers:{Accept:'application/json'},signal:controller.signal});
    if (!response.ok) throw new Error(`UPSTREAM_${response.status}`);
    if (Number(response.headers.get('content-length') || '0') > MAX_BYTES) throw new Error('UPSTREAM_TOO_LARGE');
    const text = await response.text(); if (new TextEncoder().encode(text).byteLength > MAX_BYTES) throw new Error('UPSTREAM_TOO_LARGE');
    const data = JSON.parse(text) as OfficialResponse;
    if (!Array.isArray(data.cards) || !data.page_info) throw new Error('INVALID_SCHEMA');
    return data;
  } finally { clearTimeout(timer); }
}
async function fetchMaster(kind:Kind):Promise<Card[]> {
  const all:OfficialCard[] = []; let page = 1;
  for (;;) { const data = await fetchPage(page); all.push(...data.cards); if (!data.page_info.has_next_page) break; page = data.page_info.current_page + 1; if (page > 20) throw new Error('INVALID_SCHEMA'); }
  return all.filter(card => kind === 'leader'
    ? card.card_type?.internal_id === 'leader' && card.card_rarity?.internal_id === 'LRP'
    : Boolean(card.is_ace) && card.card_rarity?.internal_id === 'SR')
    .map(card => normalize(card,kind));
}
/** Fixed card-master endpoint. It is not a generic proxy. */
export default async function handler(req:VercelRequest,res:VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  const raw = Array.isArray(req.query.kind) ? '' : req.query.kind || '';
  if (!kindIsValid(raw)) return res.status(404).json({error:'NOT_FOUND'});
  const ip = req.headers['x-forwarded-for']?.toString().split(',')[0] || req.socket.remoteAddress || 'unknown', now = Date.now(), visitor = visitors.get(ip);
  if (!visitor || now - visitor.started > RATE_WINDOW_MS) visitors.set(ip,{started:now,count:1});
  else { visitor.count++; if (visitor.count > RATE_MAX) return res.status(429).json({error:'RATE_LIMITED'}); }
  const hit = cache.get(raw); if (hit && hit.expires > now) return res.setHeader('Cache-Control','public, s-maxage=3600, stale-while-revalidate=86400').status(200).json({cards:hit.cards});
  try { const cards = await fetchMaster(raw); cache.set(raw,{expires:now + CACHE_MS,cards}); return res.setHeader('Cache-Control','public, s-maxage=3600, stale-while-revalidate=86400').status(200).json({cards}); }
  catch { return res.status(502).json({error:'OFFICIAL_CARD_MASTER_UNAVAILABLE'}); }
}
