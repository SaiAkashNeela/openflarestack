import type { Env } from '../index'
import { encodeUtf8, signHmacSha256, verifyHmacSha256 } from '../lib/crypto'

export type WebChatIntegrationConfig = {
  widgetKey?: string
  siteUrl?: string
  theme?: {
    accent?: string
    background?: string
    foreground?: string
  }
}

export function readWebChatIntegrationConfig(config: string): WebChatIntegrationConfig {
  if (!config) return {}
  try {
    const parsed = JSON.parse(config) as Record<string, unknown>
    const theme = parsed.theme && typeof parsed.theme === 'object' ? (parsed.theme as Record<string, unknown>) : {}
    return {
      widgetKey: typeof parsed.widgetKey === 'string' ? parsed.widgetKey : undefined,
      siteUrl: typeof parsed.siteUrl === 'string' ? parsed.siteUrl : undefined,
      theme: {
        accent: typeof theme.accent === 'string' ? theme.accent : undefined,
        background: typeof theme.background === 'string' ? theme.background : undefined,
        foreground: typeof theme.foreground === 'string' ? theme.foreground : undefined,
      },
    }
  } catch {
    return {}
  }
}

export function getWidgetSigningSecret(env: Env): string {
  return env.WEBCHAT_SECRET ?? env.BETTER_AUTH_SECRET ?? ''
}

export async function signWebChatSession(
  env: Env,
  payload: Record<string, unknown>,
) {
  const raw = JSON.stringify(payload)
  const signature = await signHmacSha256(getWidgetSigningSecret(env), raw)
  return { payload: raw, signature }
}

export async function verifyWebChatSession(
  env: Env,
  payload: string,
  signature: string,
) {
  return verifyHmacSha256(getWidgetSigningSecret(env), payload, signature)
}

export function buildWebChatSessionToken(
  integrationId: string,
  visitorId: string,
  conversationId: string,
) {
  return `${integrationId}.${visitorId}.${conversationId}`
}

export async function signWebChatSessionToken(
  env: Env,
  integrationId: string,
  visitorId: string,
  conversationId: string,
) {
  const payload = buildWebChatSessionToken(integrationId, visitorId, conversationId)
  const signature = await signHmacSha256(getWidgetSigningSecret(env), payload)
  return `${payload}.${signature}`
}

export async function verifyWebChatSessionToken(
  env: Env,
  token: string,
) {
  const parts = token.split('.')
  if (parts.length !== 4) return null
  const [integrationId, visitorId, conversationId, signature] = parts
  if (!signature) return null
  const payload = `${integrationId}.${visitorId}.${conversationId}`
  const ok = await verifyHmacSha256(getWidgetSigningSecret(env), payload, signature)
  if (!ok) return null
  return { integrationId, visitorId, conversationId }
}

export function webChatScript(baseUrl: string, widgetKey: string) {
  const escapedBaseUrl = JSON.stringify(baseUrl.replace(/\/$/, ''))
  const escapedKey = JSON.stringify(widgetKey)
  return `(()=>{const base=(${escapedBaseUrl}||location.origin),key=${escapedKey},d=document,s=localStorage;const idKey="ofw-visitor:"+key;const tokenKey="ofw-token:"+key;const convKey="ofw-conv:"+key;const load=()=>s.getItem(idKey)||((crypto.randomUUID&&crypto.randomUUID())||Math.random().toString(36).slice(2)+Date.now().toString(36));const visitorId=load();s.setItem(idKey,visitorId);const root=d.createElement("div");root.id="ofw-root";root.style.cssText="position:fixed;right:20px;bottom:20px;z-index:2147483647;font-family:system-ui,sans-serif";root.innerHTML='<button id="ofw-btn" style="border:0;border-radius:999px;padding:12px 16px;background:#111827;color:#fff;box-shadow:0 12px 30px rgba(0,0,0,.25);cursor:pointer">Chat</button><div id="ofw-panel" style="display:none;width:360px;height:520px;margin-top:12px;border-radius:20px;overflow:hidden;background:#fff;box-shadow:0 20px 60px rgba(0,0,0,.22);display:none;flex-direction:column;border:1px solid rgba(0,0,0,.08)"><div style="padding:14px 16px;background:#111827;color:#fff"><div style="font-weight:700">Chat</div><div style="font-size:12px;opacity:.75">We usually reply in a few minutes</div></div><div id="ofw-messages" style="flex:1;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:#f8fafc"></div><form id="ofw-form" style="display:flex;gap:8px;padding:12px;border-top:1px solid #e5e7eb;background:#fff"><input id="ofw-input" placeholder="Type a message" style="flex:1;border:1px solid #d1d5db;border-radius:999px;padding:10px 14px;font:inherit"/><button style="border:0;border-radius:999px;padding:10px 14px;background:#111827;color:#fff;cursor:pointer">Send</button></form></div>';d.body.appendChild(root);const btn=root.querySelector("#ofw-btn"),panel=root.querySelector("#ofw-panel"),messages=root.querySelector("#ofw-messages"),form=root.querySelector("#ofw-form"),input=root.querySelector("#ofw-input");const render=(who,text)=>{const el=d.createElement("div");el.style.cssText="max-width:80%;padding:10px 12px;border-radius:16px;white-space:pre-wrap;word-break:break-word;font-size:14px;line-height:1.4;background:"+(who==="agent"?"#111827;color:#fff;margin-right:auto":"#e2e8f0;color:#0f172a;margin-left:auto");el.textContent=text;messages.appendChild(el);messages.scrollTop=messages.scrollHeight};const open=()=>{panel.style.display=panel.style.display==="none"?"flex":"none"};btn.addEventListener("click",open);async function start(){const res=await fetch(base+"/api/public/webchat/"+encodeURIComponent(key)+"/session",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({visitorId,pageUrl:location.href,origin:location.origin})});if(!res.ok)return;const data=await res.json();s.setItem(tokenKey,data.token);s.setItem(convKey,data.conversationId);for(const m of data.messages||[])render(m.sender_type==="agent"?"agent":"visitor",m.content);const protocol=base.startsWith("https:")?"wss:":"ws:";const ws=new WebSocket(protocol+"//"+new URL(base).host+"/api/public/ws/"+encodeURIComponent(data.conversationId)+"?token="+encodeURIComponent(data.token));ws.onmessage=(evt)=>{try{const msg=JSON.parse(evt.data);if(msg.type==="message.created"&&msg.message&&msg.message.sender_type){render(msg.message.sender_type==="agent"?"agent":"visitor",msg.message.content)}}catch{}};form.addEventListener("submit",async(e)=>{e.preventDefault();const value=input.value.trim();if(!value)return;input.value="";render("visitor",value);await fetch(base+"/api/public/webchat/"+encodeURIComponent(key)+"/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({visitorId,token:data.token,content:value})})})}void start()})();`
}
