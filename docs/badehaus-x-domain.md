# badehausx.com production setup

GitHub Pages serves the frontend, Cloudflare manages public DNS and can serve the edge certificate, and Render serves the existing API and WebSocket endpoints.

1. Confirm `badehausx.com` in the repository’s GitHub Pages custom-domain settings, with GitHub Actions as the publishing source. The Pages workflow attempts this setting during deployment. If GitHub requests domain verification, use the exact TXT record shown in the repository owner’s GitHub Pages settings.
2. At Cloudflare, point the apex `A` records to the four GitHub Pages IPv4 addresses below. If serving `www` as well, set `www` to CNAME `robbiecalvin.github.io`. Preserve unrelated DNS records, including mail and verification records.
3. Keep the site records DNS only while GitHub verifies DNS and provisions its HTTPS certificate. Turn on Enforce HTTPS in GitHub Pages once the certificate is ready. If enabling the Cloudflare proxy afterward, use Full (strict) for a validated HTTPS connection to the GitHub origin.
4. In the existing Render service, set `PUBLIC_APP_URL=https://badehausx.com/` for password reset links, push links, and Stripe return URLs. The backend release allows this origin for API requests alongside existing configured origins.
5. Verify that the apex serves the release commit at `/build-sha.txt`, the canonical and preview URLs use the apex, and the hosted API accepts the apex origin. Browser sessions and installed web apps are tied to their origin, so members moving to the custom domain sign in again.

| Type | Name | Target |
| --- | --- | --- |
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | robbiecalvin.github.io |

[GitHub Pages custom-domain instructions](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
