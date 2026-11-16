// No automatic mutation retries: a timeout can occur after the server commits a write.
export async function boundedFetch(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs=20000): Promise<Response> {
  const controller=new AbortController();
  const abort=()=>controller.abort();
  const upstream=init.signal;
  if(upstream?.aborted)controller.abort();
  upstream?.addEventListener("abort",abort,{once:true});
  const timer=setTimeout(abort,timeoutMs);
  try {
    const response=await globalThis.fetch(input,{...init,signal:controller.signal});
    // Include body download in the deadline so JSON reads cannot hang after headers.
    const body=await response.arrayBuffer();
    return new Response(response.status===204 || response.status===205 || response.status===304 ? null:body,{status:response.status,statusText:response.statusText,headers:response.headers});
  } catch(error) {
    if(controller.signal.aborted)throw {code:"REQUEST_TIMEOUT",message:"The connection timed out. Check your connection and refresh the result before retrying; your last action may have completed."};
    throw error;
  } finally {clearTimeout(timer);upstream?.removeEventListener("abort",abort);}
}
