# Security Policy

## What is covered

This project has no releases and no version numbers. It is a website deployed
continuously from the default branch, so the only supported code is:

| Component | Supported |
| --- | --- |
| Current deployment of the site and the ingest Worker | Yes |
| Default branch (`main`) | Yes |
| Any older commit, fork or local copy | No |

Fixes are applied to `main` and reach production on the next deployment. There
are no backports.

## Reporting a vulnerability

Report privately through GitHub: open the **Security** tab of this repository
and choose **Report a vulnerability**. That creates a private advisory visible
only to the maintainer.

Please do not open a public issue or pull request for a security problem, and
do not post details anywhere public until a fix is deployed.

Useful in a report: what an attacker can do, the steps to reproduce it, and the
request or input that triggers it. A proof of concept helps; a scanner summary
without a reproduction usually does not.

This is a personal project maintained in spare time. Expect an acknowledgement
within about a week. There is no bounty, and no guaranteed fix timeline; if a
report is declined, the reason will be given.

## Scope

In scope:

- The deployed site and its server-rendered pages
- The ingest Worker and its `POST /ingest` endpoint, including its request
  signing
- The collector, its parsers, and how collected data reaches the database
- Secret handling, access control and dependency issues in this repository

Out of scope:

- The fuel network and charging operator sites this project reads. They are
  third parties; report problems there to their owners, not here.
- The national access point and other open data portals, for the same reason.
- Accuracy of prices. A wrong or stale price is a data issue, not a
  vulnerability. Open a normal issue for those.
- Cloudflare, GitHub and other platform infrastructure.
- Findings that require an already compromised maintainer account or machine.

## How this project handles credentials

No credentials are stored in the repository. Local development reads them from
`.dev.vars`, which is gitignored; production reads Worker secrets set with
`wrangler secret put`, and the collector reads GitHub Actions secrets. The
ingest endpoint accepts only HMAC signed requests with a timestamp, so a
captured body cannot be replayed indefinitely.

If you believe a secret has been exposed, report it privately as above rather
than demonstrating it.

## What the site stores about visitors

There are no user accounts, logins or passwords. The "near me" feature on the
route comparison page asks the browser for a position, uses it in the browser
to rank stations, and does not send it to the server or store it. The database
holds prices, stations and collection logs only.

## Collection conduct

This project reads publicly published pages and subscribed open data feeds. It
does not work around robots.txt, bot protection, rate limits or address level
blocks, and it does not use credentials belonging to anyone else. A source that
refuses automated access is recorded as blocked and left alone.

If you maintain a site this project reads and want it to stop, or want it done
differently, open an issue and it will be honoured.
