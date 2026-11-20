This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Startershandleiding (NL)

Grader is een lokale webapp om studentenoplossingen te verbeteren aan de hand van een verbetersleutel. De app toont per student wat er veranderd is ten opzichte van het startproject, laat je criteria afvinken en kan optioneel een AI een eerste voorstel laten doen.

### 1. Installeren en starten

Je hebt [Node.js](https://nodejs.org) (versie 22 of hoger) en `git` nodig.

```bash
npm install
npm run dev
```

Open daarna [http://localhost:3000](http://localhost:3000). Alle gegevens (projecten, oplossingen, instellingen) worden lokaal bewaard in de map `data/`.

### 2. AI instellen (optioneel)

Ga naar **Settings** en kies een **AI provider**:

- **AI Gateway**: plak een Vercel AI Gateway API-sleutel (`vck_...`). Je kan dan elk model op de Gateway gebruiken.
- **Claude-abonnement**: gebruikt de `claude` CLI op deze computer. Installeer [Claude Code](https://claude.com/claude-code) en log eenmalig in met `claude login`; de kosten gaan dan via je abonnement.

Zonder AI kan je alles gewoon manueel verbeteren.

### 3. Een verbeterproject aanmaken

Maak op het dashboard een nieuw project aan (bv. **Create your first grading project**) en upload:

1. **Starter project (.zip)**: het onaangeroerde project waarmee studenten begonnen zijn.
2. **Grading key (.json)**: de verbetersleutel, bijvoorbeeld:

   ```json
   {
     "title": "Bibliotheek-app",
     "sections": [
       {
         "id": "basis",
         "title": "Basis",
         "criteria": [
           { "id": "lijst", "description": "Toont de lijst met boeken", "points": 2 },
           { "id": "zoeken", "description": "Zoekfunctie werkt", "points": 3 }
         ]
       }
     ]
   }
   ```

Geef het project daarna een herkenbare naam, bv. "2PRO - Bibliotheek-app". De sleutel kan je later nog vervangen via **Replace grading key**.

Bestaat het project al bij een collega? Importeer het dan op het dashboard als zip-bestand of via **Import from git**.

### 4. Oplossingen uploaden

Open het project en gebruik **Upload a solution**. Je kan meerdere `.zip`-bestanden tegelijk selecteren. Vul eventueel een groep (klasgroep) in; die geldt voor alle geselecteerde bestanden.

Heb je een puntenlijst (`.xlsx`-export met een kolom *Student*/*Naam* en optioneel *Klasgroep*/*Subgroep*)? Gebruik dan **Match solutions to students** om de oplossingen automatisch aan de juiste student en groep te koppelen. Controleer de voorgestelde koppelingen voor je ze toepast.

### 5. Verbeteren

Klik op een oplossing om de werkruimte te openen:

- Links zie je de gewijzigde bestanden en de diff tegenover het startproject.
- Rechts staat de verbetersleutel (**Manual grading**): vink criteria af en voeg opmerkingen toe. Alles wordt automatisch opgeslagen.
- Met **Autograde with AI** laat je de AI een voorstel doen per criterium, met een betrouwbaarheidsscore (**Confidence**) en verwijzingen naar de code. Via **Feedback language** kies je in welke taal de AI de feedback schrijft. Controleer en corrigeer het voorstel altijd zelf.

Op de projectpagina kan je ook alle oplossingen in één keer laten **Autograde**n, en toont **Analysis** de scoreverdeling en de makkelijkste/moeilijkste criteria.

Met **Copy grades as CSV** zet je alle punten op het klembord (puntkomma-gescheiden, klaar om in Excel te plakken). Dat kan pas wanneer élke oplossing vergrendeld is (**Lock**), zodat je geen cijfers doorgeeft die nog kunnen veranderen.

### 6. Delen met collega's via Git (optioneel)

Via **Git repo** op de projectpagina maak je van het project een Git-repository die je kan pushen en pullen. Een collega importeert het dan via de Git-URL op het dashboard. De app gebruikt de Git-inloggegevens die al op je computer staan (SSH-sleutel, `gh auth login`, ...).

### 7. Puntenboek per vak (Gradebook)

Via de sectie **Gradebook** onderaan het startscherm hou je de eindscores per vak bij. Maak per academiejaar één course aan (bv. "Webontwikkeling 2026-2027").

1. **Studentenlijst importeren**: upload de `.xlsx`-export met de kolommen *Student*, *Subgroep* en (optioneel) *Pointer persoon*, *School e-mailadres* en *Vrijstelling*. Opnieuw uploaden vervangt de lijst; scores van studenten die erop blijven staan, blijven behouden.
2. **Onderdelen koppelen**: standaard zijn dat tussentijdse toets (30%), project (30%) en examen (40%), elk op /20. Gewicht en maximum kan je aanpassen. Koppel elk onderdeel aan het verbeterproject waarin het verbeterd is.
3. **Scores overzetten**: met **Import scores** haal je de punten van alle verbeterde oplossingen uit dat project op. Ze worden herschaald van het totaal van de verbetersleutel naar het maximum van het onderdeel, en gekoppeld aan de student via dezelfde naamherkenning als de puntenlijst-import. Wat niet gekoppeld raakte, wordt erbij vermeld. Zijn nog niet alle verbeteringen vergrendeld (**Lock** op de projectpagina), dan vraagt de app eerst of je toch wil importeren - er wordt pas iets weggeschreven als je bevestigt.
4. **Scores verwijderen**: met **Clear** naast een onderdeel wis je alle scores van dat onderdeel in één keer, na bevestiging. De verbeteringen zelf blijven in het verbeterproject staan, dus je kan ze nadien opnieuw importeren.
5. **Gradebook**: je kan in de tabel vrij scores aanpassen om te simuleren ("wat als deze student 14 haalt?"); het totaal rekent mee terwijl je typt en aangepaste velden staan in het accentkleur. **Dit wordt niet bewaard**: na een refresh staan de opgeslagen scores er weer. Scores komen enkel via **Import scores** in het puntenboek.
6. **Results**: gemiddelde, mediaan, slaagpercentage, spreiding, de verdeling van de eindscores, en een vergelijking per onderdeel en per klasgroep. Alleen studenten met een score voor élk onderdeel tellen mee in die cijfers.
7. **Export to Excel**: downloadt het puntenboek als `.xlsx` met twee tabbladen: *Punten* (één rij per student, met totaal op /20 en geslaagd/niet geslaagd) en *Statistiek* (de cijfers hierboven plus twee grafieken: de verdeling van de totaalscores en het gemiddelde per klasgroep).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
