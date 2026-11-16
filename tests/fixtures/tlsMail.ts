import { spawnSync } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import tls from "node:tls";
export async function createTlsMail(root:string) {
  const messages:string[]=[]; const sockets=new Set<tls.TLSSocket>(); let smtp:tls.Server;
    const key = path.join(root, "key.pem"), cert = path.join(root, "cert.pem");
    const certificate = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1"], { stdio: "ignore" });
    if(certificate.status!==0)throw new Error("SMTP fixture certificate creation failed");
    const ca = path.join(root, "ca.pem");
    fs.writeFileSync(ca, (process.env.NODE_EXTRA_CA_CERTS ? fs.readFileSync(process.env.NODE_EXTRA_CA_CERTS, "utf8") : "") + "\n" + fs.readFileSync(cert, "utf8"));
    smtp = tls.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, socket => {
      sockets.add(socket); socket.on("close", () => sockets.delete(socket)); socket.on("error", () => {});
      socket.write("220 localhost test SMTP\r\n");
      let buffer = "", data = false, body = "", authenticated = false;
      socket.on("data", chunk => {
        buffer += chunk.toString();
        for (let at; (at = buffer.indexOf("\r\n")) >= 0;) {
          const line = buffer.slice(0, at); buffer = buffer.slice(at + 2);
          if (data) { if (line === ".") { messages.push(body); body = ""; data = false; socket.write("250 queued\r\n"); } else body += line + "\r\n"; continue; }
          if (/^EHLO /i.test(line)) socket.write("250-localhost\r\n250 AUTH PLAIN\r\n");
          else if (/^AUTH PLAIN /i.test(line)) { authenticated = Buffer.from(line.slice(11), "base64").toString() === "\0fixture-user\0fixture-pass"; socket.write(authenticated ? "235 authenticated\r\n" : "535 denied\r\n"); }
          else if (/^(MAIL FROM|RCPT TO):/i.test(line)) socket.write(authenticated ? "250 accepted\r\n" : "530 authenticate\r\n");
          else if (line === "DATA" && authenticated) { data = true; socket.write("354 send mail\r\n"); }
          else if (line === "QUIT") socket.end("221 bye\r\n");
          else socket.write("250 ok\r\n");
        }
      });
    });
    smtp.listen(0, "127.0.0.1"); await once(smtp, "listening");
return {ca, messages, port:(smtp.address() as net.AddressInfo).port, async close(){for(const socket of sockets)socket.destroy();await new Promise<void>(r=>smtp.close(()=>r()));}, async next(after:number){for(let n=0;n<100 && messages.length<=after;n++)await new Promise(r=>setTimeout(r,50));if(messages.length<=after)throw new Error("SMTP fixture delivery timed out");return messages[after].replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, value) => String.fromCharCode(parseInt(value,16)));}};
}
