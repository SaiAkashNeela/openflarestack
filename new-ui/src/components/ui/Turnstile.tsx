import { useEffect } from "react";

const SCRIPT_ID = "cloudflare-turnstile-script";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";

export function Turnstile({ siteKey }: { siteKey: string }) {
  useEffect(() => {
    if (document.getElementById(SCRIPT_ID)) return;
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }, []);

  return <div className="cf-turnstile" data-sitekey={siteKey} data-theme="light" />;
}
