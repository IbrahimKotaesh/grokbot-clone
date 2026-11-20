/** Provider marks from their official websites; served locally, never fetched in chat. */
export function ProviderLogo({provider}:{provider:'claude'|'codex'}){
 return <span className={`provider-logo provider-logo--${provider==='claude'?'claude':'chatgpt'}`} aria-hidden="true"><img src={`/brands/${provider==='claude'?'claude':'chatgpt'}.svg`} width={20} height={20} alt=""/></span>;
}
