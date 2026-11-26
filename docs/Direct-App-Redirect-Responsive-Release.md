# Direct app-store redirects and viewport layout

26 November 2026

- The QR image still encodes `https://junkitout.in/app` exactly. The printed URL below the popup QR has been removed.
- GET/HEAD `/app` and `/app/` now return an empty HTTP 302 response directly to the supplied App Store or Google Play listing, before page rendering and database bootstrap. No landing HTML, scripts or intermediary customer screen is served to recognized phones.
- Android/iPhone/iPad user agents and supported platform client hints select the store. iPad Safari user agents containing Macintosh and Mobile are recognized. Unknown devices return to the normal website instead of guessing a store. No user-supplied redirect URL is accepted.
- Redirect responses are private/no-store and vary by platform headers, preventing one device's store destination from being cached for another.
- Site backgrounds and the page shell fill the dynamic viewport. Desktop homepage, hero, navigation and footer use fluid widths and responsive spacing. Agent pages have a full-width dark background instead of white gutters. Form widths remain readable.
- Existing desktop popup dismissal/session rules, app badge artwork, payment configuration and pickup workflows are retained.

Validation includes platform/header routing and empty-response tests, existing smart-link tests, type checking, production build and live HTTP redirect checks. The source ZIP excludes environment credentials, local databases and dependency directories.
