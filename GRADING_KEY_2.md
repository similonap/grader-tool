# Verbetersleutel — Event Registratie App

**Student:** ___________________________  
**Datum:** ___________________________  
**Totaal:** &nbsp;&nbsp;&nbsp;&nbsp;/ 20

---

## Opdracht 1 — Server Action &nbsp;&nbsp;&nbsp;&nbsp;/ 5

| # | Criterium | Punten | ✓ |
|---|-----------|:------:|:-:|
| 1a | `firstName`, `lastName` en `email` correct uit `formData` gehaald (`.get()`, `as string`) | 0.5 | ☐ |
| 1b | `.trim()` toegepast op alle drie velden; email omgezet naar kleine letters (`.toLowerCase()`) | 0.5 | ☐ |
| 1c | Validatie: lege velden gooien correct een `Error` | 0.5 | ☐ |
| 1d | Validatie: ontbrekend `@` in email gooit correct een `Error` | 0.5 | ☐ |
| 1e | Evenement geladen met `getEventById(eventId)`; `Error` gegooid als `null` | 0.5 | ☐ |
| 1f | Capaciteitscontrole correct: `getRegistrationCountByEvent` vergeleken met `event.capacity`; `Error` gegooid als vol | 1 | ☐ |
| 1g | `saveRegistration(...)` correct aangeroepen met de juiste argumenten | 0.5 | ☐ |
| 1h | `redirect(...)` correct aangeroepen **buiten** een `try/catch` | 1 | ☐ |

**Deeltotaal:** &nbsp;&nbsp;&nbsp;&nbsp;/ 5

**Opmerkingen:**

> _

---

## Opdracht 2 — SubmitButton &nbsp;&nbsp;&nbsp;&nbsp;/ 2

| # | Criterium | Punten | ✓ |
|---|-----------|:------:|:-:|
| 2a | `"use client"` aanwezig; `useFormStatus` geïmporteerd uit `"react-dom"` en `pending` correct gedestructureerd | 1 | ☐ |
| 2b | `<button type="submit">` is `disabled` wanneer `pending === true`; label toont `"Registering…"` / `"Register"` | 1 | ☐ |

**Deeltotaal:** &nbsp;&nbsp;&nbsp;&nbsp;/ 2

**Opmerkingen:**

> _

---

## Opdracht 3 — Formulierkoppeling &nbsp;&nbsp;&nbsp;&nbsp;/ 2

| # | Criterium | Punten | ✓ |
|---|-----------|:------:|:-:|
| 3a | `action` correct berekend met `registerForEvent.bind(null, id)` en doorgegeven aan `<form action={action}>` | 1 | ☐ |
| 3b | `<SubmitButton />` geïmporteerd en gerenderd **binnen** het `<form>`-element | 1 | ☐ |

**Deeltotaal:** &nbsp;&nbsp;&nbsp;&nbsp;/ 2

**Opmerkingen:**

> _

---

## Opdracht 4 — Error boundary &nbsp;&nbsp;&nbsp;&nbsp;/ 2

| # | Criterium | Punten | ✓ |
|---|-----------|:------:|:-:|
| 4a | `"use client"` aanwezig; `useEffect` logt de fout naar de console | 0.5 | ☐ |
| 4b | Props `error: Error` en `reset: () => void` correct gedeclareerd | 0.5 | ☐ |
| 4c | `error.message` zichtbaar in de UI; "Try again"-knop roept `reset()` aan | 0.5 | ☐ |
| 4d | Link terug naar `"/"` aanwezig | 0.5 | ☐ |

**Deeltotaal:** &nbsp;&nbsp;&nbsp;&nbsp;/ 2

**Opmerkingen:**

> _

---

## Opdracht 5 — Bevestigingspagina &nbsp;&nbsp;&nbsp;&nbsp;/ 3

| # | Criterium | Punten | ✓ |
|---|-----------|:------:|:-:|
| 5a | `id` correct uit `params` gehaald; `getEventById(id)` aangeroepen; `notFound()` bij ontbrekend evenement | 0.5 | ☐ |
| 5b | `getRegistrationsByEvent(id)` aangeroepen en resultaat gebruikt | 0.5 | ☐ |
| 5c | Succesbanner met evenementtitel en "Browse more events"-link gerenderd | 0.5 | ☐ |
| 5d | Aantal inschrijvingen versus capaciteit correct weergegeven | 0.5 | ☐ |
| 5e | Lijst van deelnemers gerenderd met naam, e-mail en `createdAt` | 0.5 | ☐ |
| 5f | `key`-prop correct opgelost met `reg._id?.toString()` | 0.5 | ☐ |

**Deeltotaal:** &nbsp;&nbsp;&nbsp;&nbsp;/ 3

**Opmerkingen:**

> _

---

## Opdracht 6 — Organisatorsdashboard &nbsp;&nbsp;&nbsp;&nbsp;/ 4

| # | Criterium | Punten | ✓ |
|---|-----------|:------:|:-:|
| 6a | `getCurrentUser()` aangeroepen; doorgestuurd naar `"/auth/login"` als `null` | 1 | ☐ |
| 6b | `getAllRegistrations()` aangeroepen | 0.5 | ☐ |
| 6c | Inschrijvingen correct gegroepeerd per `eventId` (bv. met `reduce`) | 1 | ☐ |
| 6d | Header met e-mailadres ingelogde gebruiker en werkend uitlogformulier (`<form action={logout}>`) | 0.5 | ☐ |
| 6e | Tabel per evenementgroep correct gerenderd (naam, e-mail, datum); terugvalbericht bij geen inschrijvingen | 1 | ☐ |

**Deeltotaal:** &nbsp;&nbsp;&nbsp;&nbsp;/ 4

**Opmerkingen:**

> _

---

## Opdracht 7 — Authenticatiebewaker &nbsp;&nbsp;&nbsp;&nbsp;/ 2

| # | Criterium | Punten | ✓ |
|---|-----------|:------:|:-:|
| 7a | `"jwt"`-cookie correct uitgelezen; doorsturen naar `"/auth/login"` als ontbrekend | 0.5 | ☐ |
| 7b | `jwt.verify(...)` gebruikt in een `try/catch`; doorsturen bij ongeldig/verlopen token | 0.5 | ☐ |
| 7c | Geldig token geeft `NextResponse.next()` terug | 0.5 | ☐ |
| 7d | `config.matcher` correct ingesteld op `["/organiser", "/organiser/:path*"]` | 0.5 | ☐ |

**Deeltotaal:** &nbsp;&nbsp;&nbsp;&nbsp;/ 2

**Opmerkingen:**

> _

---

## Eindtotaal

| Opdracht | Max | Behaald |
|----------|:---:|:-------:|
| 1 — Server Action | 5 | |
| 2 — SubmitButton | 2 | |
| 3 — Formulierkoppeling | 2 | |
| 4 — Error boundary | 2 | |
| 5 — Bevestigingspagina | 3 | |
| 6 — Organisatorsdashboard | 4 | |
| 7 — Authenticatiebewaker | 2 | |
| **Totaal** | **20** | |

**Algemene feedback:**

> _
