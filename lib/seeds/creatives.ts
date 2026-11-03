/**
 * The SOUS SOUS creative collaborators deck, as data (Tess, 2026-11-02: "Add
 * photographers to ssync from deck … create a space for potential models to be
 * added as well and add the ones in the deck above to ssync").
 *
 * Source: the Google Slides deck "SS_Creative Collaborators" as it stood on
 * 2 November 2026 — the 39 names on its roster slide and the 14 on its model
 * shortlist, plus the two casting references from its casting slide. Every field
 * is copied from the deck (each slide's one-line look, Selected work, Saved
 * reference, Find, and the speaker notes, which hold the sources). Nothing was
 * re-researched for this import.
 *
 * Location is the person's base, for the directory's by-city view. The deck
 * shows a base only for New York creatives (Tess, 2026-10-30); for everyone else
 * the base here is the one its speaker notes give, and it is left blank where
 * the notes don't settle on one. Imported by app/actions/seeds.ts, which only
 * adds what is missing and only fills blank card fields, so it is safe to run
 * again. Pure data: no imports.
 */

export type SeedImage = {
  /** A static path under /public, served with the deploy (like public/roster). */
  src: string;
  /** Who took the picture, when known. */
  credit?: string;
  note?: string;
};

export type PersonSeed = {
  name: string;
  location: string;
  /** Instagram, as a full URL (the stored form). */
  ig?: string;
  /** Website or agency page. */
  link?: string;
  images: SeedImage[];
  /**
   * Borrow the picture already saved on another SSYNC row, matched by id or by
   * the name credited on it — Alexandra Agoston's FRAME image on Campaign,
   * Lucinda Levant's portrait by Aaron Crossman. The row is shared by URL, not
   * copied, and the import looks in Trash too (Aaron Crossman's reference was
   * removed from Campaign on 15 September).
   */
  borrow?: { id?: string; photographer?: string; model?: string };
  group: string;
  role?: string;
  age?: string;
  agency?: string;
  photo?: boolean;
  video?: boolean;
  pastWork: string;
  notes: string;
};

const ig = (h: string) => `https://www.instagram.com/${h}/`;
const roster = (slug: string, files: string[]): SeedImage[] =>
  files.map((f) => ({ src: `/roster/${slug}/${f}`, note: "From the photographer library" }));
const h4 = ["h1.jpg", "h2.jpg", "h3.jpg", "h4.jpg"];
const g4 = ["g1.jpg", "g2.jpg", "g3.jpg", "g4.jpg"];

const MOVEMENT = "Movement";
const PORTRAIT = "Portrait & studio";
const DOCUMENTARY = "Documentary & atmosphere";
const BTS = "Behind the scenes";
const DIRECTORS = "Directors";

export const PHOTOGRAPHER_SEED: PersonSeed[] = [
  // ── 01 · Movement ────────────────────────────────────────────────────────────
  {
    name: "Ryan Marie Helfant",
    group: MOVEMENT,
    role: "Director of photography",
    location: "New York",
    link: "https://ryanmariehelfant.com",
    images: [],
    photo: false,
    video: true,
    pastWork: "Beyoncé (VMA, best cinematography) · Solange, When I Get Home · Balenciaga · Louis Vuitton · Ralph Lauren · Gucci · Zara · Rimowa",
    notes:
      "A cinematographer who films dance. Co-directed New York City Ballet’s When We Fell with choreographer Kyle Abraham.\n\nSaved reference: New York City Ballet, When We Fell: premiered at the Venice Biennale, a NYT Critic’s Pick.\n\nThe one director of photography in this round. Tess’s note in SSYNC: “Incredible DP.” NYCB credits Helfant as director and cinematographer on When We Fell, a second NYCB film after the 2018/19 campaign film First Comes Sweat. The site lists DP work for Bad Bunny, Lorde, Vince Staples and Solange (VMA nomination), Beyoncé (VMA win for cinematography), fashion films for Balenciaga with Isabelle Huppert and Louis Vuitton with Emma Stone, and the Run series with Willem Dafoe (Hauser & Wirth, SFMOMA). Base is not stated on the site; New York is inferred from the work. Sources: nycballet.com, ryanmariehelfant.com, FlickList.",
  },
  {
    name: "Emily Lipson",
    group: MOVEMENT,
    role: "Photographer",
    location: "New York",
    ig: ig("emily.lipson"),
    images: [],
    photo: true,
    pastWork: "Interview · Dazed · W · WSJ · Document Journal · Nike · Zara · Tom Ford · Helmut Lang",
    notes:
      "Trained as a dancer, later photo editor at W. Exact pictures, then roughed up: some go through an office copier. New York, also Paris.\n\nSaved reference: four frames, brand not credited.\n\nA strong fit for a dance-built brand: Lipson trained seriously as a dancer, and interviews tie that training to how the pictures handle bodies. Former photo editor at W. Editorial: Interview, Dazed, W, WSJ, Document Journal. Brands: Nike, Zara, Milk Makeup, Kate Spade, Tom Ford, Tory Burch, Helmut Lang. First photobook, Dykes (portraits of queer women). Listed in Forbes 30 Under 30, Art & Style. Sources: models.com, Dazed, Visie.",
  },
  {
    name: "Jesse Gouveia",
    group: MOVEMENT,
    role: "Photographer",
    location: "New York",
    ig: ig("jessegouveia"),
    images: roster("jesse-gouveia", h4),
    photo: true,
    pastWork: "T Magazine · The New York Times · i-D · Document Journal · AnOther Magazine · Totokaelo",
    notes:
      "From Seattle, now in lower Manhattan. Close city moments, and long exposures that turn movement into colour.\n\nFrom the photographer library (New York). Booooooom: born and raised in Seattle, based in lower Manhattan. Select clients per the photographer’s own profile: i-D, T Magazine, The New York Times, Document Journal, Totokaelo; i-D’s 2019 year-in-photos lists Document Journal and T Magazine work. AnOther Magazine has published the personal series Plaid and Other Works. Image from the photographer library, internal use only. Sources: Booooooom, i-D, AnOther Magazine, Goodreads.",
  },
  {
    name: "Parker Woods",
    group: MOVEMENT,
    role: "Photographer",
    location: "New York",
    link: "https://parker-woods.com/",
    images: roster("parker-woods", h4),
    photo: true,
    pastWork: "WUL Magazine interview · fashion and portrait editorials [clients to confirm]",
    notes:
      "Black-and-white bodies and form: sculptural fashion, abstract shapes and plain-spoken realism.\n\nFrom the photographer library (New York). A WUL Magazine interview calls Woods an American photographer from LA, with themes of abstract forms, still life and truthful realism; Visie lists New York. No client list found, so this is a pick on the work. Images from the photographer library, internal use only. Sources: WUL Magazine, Visie.",
  },
  {
    name: "Jamie Heath",
    group: MOVEMENT,
    role: "Photographer",
    location: "Sydney",
    ig: ig("jamie_heath"),
    images: roster("jamie-heath", g4),
    photo: true,
    pastWork: "Vogue Australia, incl. a Pamela Anderson story (2026) · Russh × Tommy Hilfiger (2023)",
    notes:
      "Raw feeling with a cinematic eye. The saved series is dancers at the barre, in black and white.\n\nSaved reference: dance series, shot in Paris, 2025.\n\nBorn and raised in Sydney, represented by BA Reps, whose bio describes emotional rawness held by a stylised, cinematic eye. Models.com credits: Vogue Australia (October 2024, and a 2026 story with Pamela Anderson) and a Russh special for Tommy Hilfiger (May 2023). The SSYNC reference was shot in Paris in 2025, so Heath may work between the two; base worth confirming. Sources: ba-reps.com, models.com.",
  },
  {
    name: "Mac Scott",
    group: MOVEMENT,
    role: "Photographer",
    location: "",
    link: "https://mac-scott.com",
    images: [],
    photo: true,
    pastWork: "Nike Running FA25 · Nike Vomero 18 · Personal series incl. Beautiful Suffering and A Working Form",
    notes:
      "Gritty, grainy and athletic: sweat, blur and hard sun on runners in big landscapes.\n\nSaved reference: UVU, runner in the mountains.\n\nThe description follows Tess’s note in SSYNC: “Gritty grainy athletic aesthetic.” The selected-work index on mac-scott.com names two Nike projects (Vomero 18, Running FA25) and personal series including Summer Sport, Ordered Chaos, Beautiful Suffering, A Working Form and To the Core. UVU is not listed on the site, and no base city is given there; both need checking. Source: mac-scott.com.",
  },
  {
    name: "Boris Lutters",
    group: MOVEMENT,
    role: "Photographer",
    location: "Amsterdam",
    ig: ig("borislutters"),
    images: roster("boris-lutters", g4),
    photo: true,
    pastWork: "adidas (2025) · Exit Magazine, “Superstar” (2025) · Represented by CZAR Amsterdam",
    notes:
      "Art and fashion in one frame: hard shadows, figures mid-stride, clean grey rooms.\n\nSaved reference: Martan.\n\nAmsterdam-based; studied graphic design, then moved to the Utrecht School of the Arts (HKU). Represented by CZAR Amsterdam, whose announcement describes a visual language shaped by fashion. Models.com credits an adidas advertising job (January 2025) and an Exit Magazine editorial, Superstar (April 2025). No public source tied Lutters to Martan; that credit comes from SSYNC only. Sources: shots.net, LBB Online, models.com.",
  },
  {
    name: "Stuart Winecoff",
    group: MOVEMENT,
    role: "Photographer, also director of photography",
    location: "London",
    link: "https://objectanimal.com",
    images: roster("stuart-winecoff", g4),
    photo: true,
    video: true,
    pastWork: "Cinematography background · Booooooom photographer spotlight · represented by Object Animal",
    notes:
      "Grew up in Southern California and came from film. Warm, gritty rooms and night-time city energy.\n\nFrom the photographer library (no city listed there). Visie lists Winecoff as London-based; Booooooom says born and raised in Southern California, with a mother and grandmother who were both photographers; Object Animal’s talent page notes roots as a director of photography. No published client list found. Image from the photographer library, internal use only. Sources: Booooooom, Object Animal, Visie.",
  },
  {
    name: "Paul Bellaart",
    group: MOVEMENT,
    role: "Photographer",
    location: "Amsterdam",
    ig: ig("paulbellaart"),
    images: [],
    photo: true,
    pastWork: "Vogue Netherlands covers · Duncan Laurence, “Arcade” video · book Last Year’s Nest (2020)",
    notes:
      "Wind, bodies and closeness. A regular Vogue Netherlands cover photographer since 2012.\n\nFrom the photographer library (Amsterdam). Fashion, portrait and lifestyle photographer; Royal Academy of Art, The Hague; works closely with Vogue Netherlands since 2012, often on covers; a favourite photographer of Doutzen Kroes; directed the video for Duncan Laurence’s Eurovision song Arcade; self-published book Last Year’s Nest (Distanz, 2020). No verified brand client list found. Sources: PreViiew, Wonderful Machine, Main Studio, models.com.",
  },
  {
    name: "Louise & Maria Thornfeldt",
    group: MOVEMENT,
    role: "Photographer duo, sisters",
    location: "Copenhagen",
    link: "https://lundlund.com",
    images: [],
    photo: true,
    pastWork: "WSJ Magazine (Sept 2023) · represented by LUNDLUND [clients to confirm]",
    notes:
      "Bodies folded, curled and sculptural, in clean, graphic studio frames.\n\nFrom the photographer library, where Louise Thornfeldt and Maria Thornfeldt are listed separately in Copenhagen; they work as a sister duo, represented together by LUNDLUND (Stockholm). A WSJ Magazine story (Sept 2023) is credited to Louise & Maria Thornfeldt. One unreliable profile says Louise lives in Paris, so confirm base. No verified client list found. Sources: LUNDLUND, Anne of Carversville, Visie.",
  },

  // ── 02 · Portrait & studio ───────────────────────────────────────────────────
  {
    name: "Chris Colls",
    group: PORTRAIT,
    role: "Photographer",
    location: "New York",
    ig: ig("chriscolls"),
    images: [],
    photo: true,
    pastWork: "Max Mara · La Perla · FRAME · Moncler · Saint Laurent · Karl Lagerfeld · Vogue covers",
    notes:
      "Australian-born. Black-and-white bodies and long tailoring, lit hard and sculptural. New York, also Paris.\n\nSaved reference: FRAME, with Alexandra Agoston; the long-coat frame is Gisele Bündchen.\n\nRaised in Australia; started as a portrait photographer in Geelong at 16. Profiles place Colls in New York (a SoHo loft shared with partner Alexandra Agoston, the model in the first saved image; the long-coat image is Gisele Bündchen) and working often in Paris. Clients named across profiles: Max Mara, La Perla, Liu Jo, FRAME, Karl Lagerfeld, Juicy Couture, Moncler (#WeLoveWinter), Saint Laurent, many Vogue covers. Client lists online may be dated. Sources: The Impression, Ramp, APA.",
  },
  {
    name: "James Brodribb",
    group: PORTRAIT,
    role: "Photographer",
    location: "New York",
    ig: ig("jamesbrodribb"),
    images: [],
    photo: true,
    pastWork: "Replica Man · i-D · Vogue France · Document Journal · FT HTSI · Mr Porter · Calvin Klein · Isabel Marant · Giorgio Armani",
    notes:
      "Shoots mostly on film. Menswear with easy, lived-in styling. Born in England, raised in Normandy and South Africa.\n\nSaved reference: menswear story, brand not credited.\n\nNew York-based, with Paris representation through Cadence Image and a bio at Nevermind Agency. Started at a creative agency in New York, then assisted other photographers. Recent models.com credits: FT HTSI, Mr Porter, Net-A-Porter lookbooks, and a Replica Man story for Saint Laurent. Commercial: Calvin Klein, Zara, Isabel Marant, Giorgio Armani. Sources: nevermindagency.com, models.com, theagents.club.",
  },
  {
    name: "Bono Melendrez",
    group: PORTRAIT,
    role: "Photographer",
    location: "New York",
    ig: ig("bonomelendrez"),
    images: [],
    photo: true,
    pastWork: "Ellie Christen portraits · Press photography for the band Rips",
    notes:
      "Soft daylight, long shadows, plain colour walls. Close, unforced portraits. Base: New York, to confirm.\n\nSaved reference: two portraits of Ellie Christen.\n\nThe least documented name in this round, with no fashion agency or client list found. The name matches a Brooklyn musician and engineer (bass in GMO, studio credits on Brooklyn records) who is also credited for press photos of the band Rips. That is likely the same person given the rare name, but confirm before relying on it. Sources: Force Field PR, Muck Rack, Bandcamp.",
  },
  {
    name: "Phoenix Johnson",
    group: PORTRAIT,
    role: "Photographer, also motion",
    location: "New York",
    link: "https://theagents.club/phoenix-johnson",
    images: roster("phoenix-johnson", h4),
    photo: true,
    video: true,
    pastWork: "Apple · Nike · Marc Jacobs · Sandy Liang · Urban Outfitters · Highsnobiety",
    notes:
      "Raised in Tennessee. Cinematic but intimate pictures that sit between fashion, culture and portraiture.\n\nAdded at Tess’s request. A fashion, motion and portrait photographer, born and raised in Tennessee and based in New York City, per an agency profile on The Agents Club. That profile lists collaborations with Apple, Nike, Marc Jacobs, Sandy Liang and Urban Outfitters, and commissions for Céline Vivod, Carter Young, Ansolet Rossouw and Highsnobiety; models.com credits an Urban Outfitters (Kimchi Blue) lookbook, February 2021. Client list is self-reported. Sources: theagents.club, models.com.",
  },
  {
    name: "Jackie Kursel",
    group: PORTRAIT,
    role: "Photographer",
    location: "New York",
    ig: ig("jkursel"),
    images: roster("jackie-kursel", h4),
    photo: true,
    pastWork: "Calvin Klein · Aimé Leon Dore · Mansur Gavriel · Document Journal · Office cover",
    notes:
      "Graphic black and white: profiles, hair and hard shadows. Shaped by a suburban Midwest upbringing.\n\nFrom the photographer library (New York). Commissions listed by Visie and Primary Photographic: Document Journal, Puss Puss Magazine, Calvin Klein, Aimé Leon Dore, Mansur Gavriel; also an Office Magazine cover. Primary Photographic notes the influence of a suburban Midwest upbringing. Images from the photographer library, internal use only. Sources: Visie, Primary Photographic.",
  },
  {
    name: "Jody Rogac",
    group: PORTRAIT,
    role: "Photographer",
    location: "New York",
    ig: ig("jodyrogac"),
    images: [],
    photo: true,
    pastWork: "The Row · Celine · Chloé · Chanel · Tiffany & Co. · The Gentlewoman · T Magazine",
    notes:
      "British-Canadian, raised in Vancouver. Clear, composed portraits of grown women with warmth. London, also New York.\n\nFrom the photographer library (New York). The Agents Club says a British-Canadian photographer living in New York; The Gentlewoman and Visie say London-based, raised in Vancouver, so confirm base. Clients: The New York Times Magazine, The Row, Tory Burch, Theory, Apple, Rachel Comey, Celine, Chloé, Tiffany & Co., Chanel, Bvlgari, Margaret Howell; editorial for The Gentlewoman, Time, Harper’s Bazaar, T Magazine, Double, Marfa Journal. Co-founded Pictures for Elmhurst (2020). Sources: The Agents Club, The Gentlewoman, Visie.",
  },
  {
    name: "Talia Chetrit",
    group: PORTRAIT,
    role: "Photographer and artist",
    location: "New York",
    ig: ig("taliachetrit"),
    images: [],
    photo: true,
    pastWork: "Helmut Lang FW24, with Irina Shayk · Helmut Lang Resort 2018 · Céline · Duran Lantink",
    notes:
      "Intimate, confrontational pictures of people and bodies, made for galleries and fashion alike.\n\nFrom the photographer library (New York). American photographer and multimedia artist, born 1982 in Washington, DC; known for intimate portraits of family, friends and strangers. Shot Helmut Lang’s Fall 2024 campaign with Irina Shayk (creative direction by Peter Do, shot in New York) and earlier Helmut Lang and Céline advertising, including Helmut Lang Resort 2018; a Duran Lantink story (Feb 2025) on the agency page. Gallery representation includes Kaufmann Repetto and Hark Awik. Sources: The Impression, L’Officiel, Harkawik, The Agents Club.",
  },
  {
    name: "Adam Peter",
    group: PORTRAIT,
    role: "Photographer",
    location: "",
    ig: ig("adam_peter"),
    images: [],
    photo: true,
    pastWork: "[If this is Adam Peter Johnson] Prada · JW Anderson · Courrèges · Tom Ford · i-D",
    notes:
      "Pale, wind-blown black-and-white portraits, soft grain, a lot of air around the figure.\n\nSaved reference: Harper’s Bazaar France, with Ella McCutcheon.\n\nIdentity needs checking. The closest public match is Adam Peter Johnson, a French photographer and director based in Paris and represented by MAP, whose work has run in Bazaar France (a Harper’s Bazaar France Homme story in November 2025). MAP lists Prada, Courrèges, Burberry, Rabanne, JW Anderson, Tom Ford and Dior, plus i-D, Dust and D Repubblica. Nothing found links the Instagram handle @adam_peter to that profile, so confirm on Instagram first. Sources: mapltd.com, models.com.",
  },
  {
    name: "Sarah Blais",
    group: PORTRAIT,
    role: "Photographer",
    location: "",
    ig: ig("sarahblais"),
    images: [],
    photo: true,
    pastWork: "The Frankie Shop: Spring 2023, Winter 2025 and 2026 campaigns · Paper Journal",
    notes:
      "Documentary, portrait and fashion. Still, centred studio pictures with a quiet strangeness.\n\nSaved reference: The Frankie Shop.\n\nA repeat Frankie Shop photographer: the Spring 2023 campaign (with Veronika Kunz), Winter 25 and the “Big Mood” journal story (styled by Monika Tatalovic), and a March 2026 advertising job. Contributor to Paper Journal. Sources disagree on base: Ignant says London, WUL says Paris and Berlin, Visie says New York. Sources: models.com, The Impression, thefrankieshop.com, Ignant, WUL, Visie.",
  },
  {
    name: "Aaron Crossman",
    group: PORTRAIT,
    role: "Photographer",
    location: "London",
    link: "https://aaron-william-crossman.format.com",
    images: [],
    borrow: { photographer: "Aaron Crossman" },
    photo: true,
    pastWork: "Vogue Arabia · Vogue Philippines · Self Service · ODDA (Dior special) · Twin · Clinique",
    notes:
      "Close, grainy portraits in soft daylight: loose hair, bare skin, a direct look into the lens.\n\nSaved reference: Lucinda Levant, brand not credited (removed from Campaign on 15 September 2026; it can be restored from Trash).\n\nAdded at Tess’s request. A London-based fashion and beauty photographer; his own site says he works between London, Paris and New York. Models.com lists him as represented worldwide by MONDAY, with editorials for Vogue Arabia (Dec 2024), Vogue Philippines (Jul 2024), Self Service (“Obsessions”, Nov 2023), an ODDA Dior special (Nov 2021) and Twin (Jun 2026). His Cherry Deck profile mentions campaigns for Clinique and Captain Morgan and work for Warner, Sony and Universal; that client list is self-reported. In a 2019 Lomography interview he described moving from portrait work toward high-end fashion editorial. Sources: models.com, Cherry Deck, aaron-william-crossman.format.com, Lomography.",
  },
  {
    name: "Valentin Hennequin",
    group: PORTRAIT,
    role: "Photographer",
    location: "Paris",
    link: "https://models.com/people/valentin-hennequin",
    images: roster("valentin-hennequin", g4),
    photo: true,
    pastWork: "FT · Le Monde · WSJ · Vogue · Apartamento · Mango · Zegna · Net-a-Porter · Harrods",
    notes:
      "Elegant, timeless pictures of women and men, often in black and white, with the city as the set.\n\nFrom the photographer library (no city listed there). Models.com describes a Paris-based photographer working across womenswear and menswear with an elegant, simple, poetic look; editorial for the Financial Times, Le Monde, WSJ, Vogue and Apartamento; commercial clients Mango, Zegna, Net-a-Porter, Harrods and Church’s; also Le Figaro and Roy Rogers SS22. Client list is from the photographer’s profile. Images from the photographer library, internal use only. Sources: models.com.",
  },
  {
    name: "Stef Mitchell",
    group: PORTRAIT,
    role: "Photographer and director",
    location: "Paris",
    link: "https://models.com/people/stef-mitchell",
    images: roster("stef-mitchell", g4),
    photo: true,
    video: true,
    pastWork: "Jil Sander SS26 campaign (Simone Bellotti’s debut) · Khaite 2026 · Document Journal",
    notes:
      "Australian-born. Sculptural, gestural fashion pictures with a quiet intimacy.\n\nFrom the photographer library (no city listed there). Australian-born; The Fashionography says now based in Paris, while an older Russh piece says New York, so base worth confirming. Photographer and director of Jil Sander’s SS26 campaign, the first under Simone Bellotti; a Khaite advertising campaign (April 2026); a 2018 Document Journal editorial. Images from the photographer library, internal use only. Sources: models.com, Hypebeast, The Fashionography, Russh.",
  },
  {
    name: "Sam Rock",
    group: PORTRAIT,
    role: "Photographer",
    location: "London",
    images: roster("sam-rock", ["1.jpg", "2.jpg", "3.jpg"]),
    photo: true,
    pastWork: "M Le Monde · Office · Another Man · i-D · Vogue Paris",
    notes:
      "Fine art, editorial and commercial. Direct portraits and night scenes with an edge. Represented by Art + Commerce.\n\nFrom the photographer library (no city listed there). Represented worldwide by Art + Commerce, which describes a London-based photographer who travels between Paris and New York, across fine art, editorial and commercial work; published in M Le Monde, Office, Another Man, i-D and Vogue Paris. No named brand clients found. The library images are small, so these may look soft. Images from the photographer library, internal use only. Sources: Art + Commerce, Visie, The Fashionography.",
  },
  {
    name: "Senta Simond",
    group: PORTRAIT,
    role: "Photographer",
    location: "Paris",
    images: [],
    photo: true,
    pastWork: "Bottega Veneta · Chanel · Hermès · Jil Sander · Miu Miu · Proenza Schouler 2026 · M Le Monde",
    notes:
      "Swiss-born. Intimate, unhurried fashion pictures of women, with real movement; exhibited at the MEP in Paris. Represented by Webber.\n\nFrom the photographer library (Paris). Swiss fashion photographer working in fashion since 2018; solo show Dissonance at the MEP Studio, Paris; La Prairie house artist (whose page says London, so base worth confirming). Webber lists Acne Studios, AnOther, Bottega Veneta, Boucheron, Calvin Klein, Chloé, Chanel, Dazed, Double, Hermès, Holiday, i-D, Jil Sander, La Prairie, M Le Monde, Miu Miu, Nina Ricci, Pucci, Purple, Self Service; models.com adds Phoebe Philo and a Proenza Schouler 2026 campaign. Sources: Webber, MEP, models.com, La Prairie.",
  },
  {
    name: "Jana Gerberding",
    group: PORTRAIT,
    role: "Photographer",
    location: "Berlin",
    ig: ig("jana_gerberding"),
    images: [],
    photo: true,
    pastWork: "Mytheresa · L’Officiel Italia · 10 Magazine · Scandinavian Man · Görtz",
    notes:
      "English-born. Grown-up tailoring and texture, with wit and personality.\n\nFrom the photographer library (Berlin). Sleek describes an English photographer working in Berlin since 2009, known for clever, good-humoured fashion imagery; Visie lists Paris, so confirm base. Credits: Mytheresa (via Bird Production), L’Officiel Italia (Daniela Kocianova), 10 Magazine (Sept 2025), Scandinavian Man (Dec 2019), and a Görtz shoot as director. No full client list found. Sources: Sleek, models.com, Bird Production, Production Paradise.",
  },
  {
    name: "Johan Sandberg",
    group: PORTRAIT,
    role: "Photographer",
    location: "Stockholm",
    link: "https://lundlund.com",
    images: [],
    photo: true,
    pastWork: "Armani · Calvin Klein · Dior · Gucci · Vogue Germany · Interview · V Magazine",
    notes:
      "Severe, minimal tailoring and portraits that blend fashion with documentary.\n\nFrom the photographer library (Stockholm). Represented by LUNDLUND, which describes a Stockholm-based photographer with an international network blending portrait, documentary and fashion; PreViiew says since moved to Paris, so confirm base. Clients per LUNDLUND: Armani, AALTO, Vogue Germany, Interview, Calvin Klein, H&M, Gucci, Benetton, Christian Dior; PreViiew adds Sergio Rossi, V Magazine, Dazed and Marie Claire Italy. Client lists are self-reported. Sources: LUNDLUND, PreViiew, models.com.",
  },
  {
    name: "Matthias Leidinger",
    group: PORTRAIT,
    role: "Photographer",
    location: "Berlin",
    ig: ig("matthiasleidinger"),
    images: [],
    photo: true,
    pastWork: "Carhartt 2026 · ICON Magazin · Petrichor for FIGURES · WHITELIES",
    notes:
      "Austrian. Raw, quiet black and white: bodies, lone figures and land.\n\nFrom the photographer library (Berlin). Models.com: Berlin-based, Austrian, with artist management; 2026 credits include a Carhartt lookbook (January) and ICON Magazin Germany (April). Personal stories Petrichor (FIGURES Photography Magazine) and Lacuna (Arxipelag), and WHITELIES Magazine. Little else published, so a pick on the work. Sources: models.com, FIGURES, Arxipelag, Ignant.",
  },

  // ── 03 · Documentary & atmosphere ────────────────────────────────────────────
  {
    name: "Menelik Puryear",
    group: DOCUMENTARY,
    role: "Photographer",
    location: "New York",
    ig: ig("mr_puryear"),
    images: roster("menelik-puryear", h4),
    photo: true,
    pastWork: "Parke & Ronen SS26 · For Love & Lemons SS26 · Rag & Bone · Esquire (Fendi) · Mr Porter",
    notes:
      "Sharp black-and-white tailoring next to sun-bleached, lived-in street and sport moments.\n\nFrom the photographer library (New York). Models.com credits: several Parke & Ronen campaigns (incl. Spring 2026), For Love & Lemons Spring 2026, Rag & Bone, an Esquire US Fendi feature, Mr Porter’s The Journal, Hero, Flaunt and Desnudo. These are credit listings, not a client list. Images from the photographer library, internal use only. Sources: models.com, Visie.",
  },
  {
    name: "Drew Vickers",
    group: DOCUMENTARY,
    role: "Photographer",
    location: "Paris",
    ig: ig("drewvickers"),
    images: roster("drew-vickers", ["1.jpg"]),
    photo: true,
    video: true,
    pastWork: "Prada · Louis Vuitton · The Row · Bottega Veneta · Hermès · Jacquemus · Alaïa · Missoni SS24 · i-D · System",
    notes:
      "American. A documentary eye with fashion-level craft: couture on real streets.\n\nSaved reference: PRINT, “Shayk Shack”, with Irina Shayk.\n\nRepresented by Art Partner, which describes an American photographer based in Paris whose work joins documentary practice with the technical side of fashion, across photography and film. Brands named there: Prada, Louis Vuitton, Chanel Beauty, Jacquemus, Supreme, The Row, adidas, Calvin Klein, Bottega Veneta, Tom Ford, Khaite, Saint Laurent, Burberry, Hermès, Alaïa, Rhode. Editorial: i-D, Double, M Le Monde, System, Vogue Italia, Self Service, The Gentlewoman. Shot Irina Shayk for Missoni Beachwear SS24 as well as the PRINT story saved in SSYNC. Personal project: a Cheerleading Series (2019, Texas high schools). One of the three saved frames no longer loads from SSYNC storage. Sources: artpartner.com, Fashion Gone Rogue, models.com.",
  },
  {
    name: "James Ari King",
    group: DOCUMENTARY,
    role: "Photographer and director",
    location: "",
    ig: ig("j_ari_king"),
    images: [],
    photo: true,
    video: true,
    pastWork: "Bottega Veneta, Fall 2026 lookbook · Carven · Represented by Artworld",
    notes:
      "A fine-art photographer and director working in restraint, atmosphere and landscape.\n\nSaved reference: Bottega Veneta, Paris, 2026.\n\nArtworld Agency’s bio describes a fine-art photographer and director focused on restraint, atmosphere and landscape, and names Bottega Veneta and Carven among fashion collaborations. Models.com credits the Bottega Veneta Fall 26 lookbook (designer Louise Trotter). SSYNC records the saved image as shot in Paris, 2026; that is a shoot location, not a confirmed base. Sources: artworld.agency, models.com.",
  },
  {
    name: "Tamara Reynolds",
    group: DOCUMENTARY,
    role: "Photographer",
    location: "Nashville",
    link: "https://tamarareynoldsphotography.com",
    images: roster("tamara-reynolds", h4),
    photo: true,
    pastWork: "The New York Times · Bloomberg Businessweek · Mother Jones · book The Drake (Dewi Lewis, 2022)",
    notes:
      "Documentary portraits of the American South: real, unvarnished people photographed with tenderness.\n\nFrom the photographer library (Nashville). Decades of commercial, editorial and documentary work; first job was photographing Johnny Cash for Guitar Magazine. Editorial for The New York Times, Bloomberg Businessweek, Mother Jones, NBC News and The Bitter Southerner. The series The Drake, about people around an old Nashville motel, won a 2018 Center Project Launch Grant and became a book (Dewi Lewis, 2022). Listed as a Guggenheim Fellow; teaches at Vanderbilt and Belmont. A documentary pick: more grit and maturity than fashion polish. Image from the photographer library, internal use only. Sources: Lenscratch, Vanderbilt, Guggenheim Foundation, Fotoroom.",
  },
  {
    name: "Benoit Peverelli",
    group: DOCUMENTARY,
    role: "Photographer",
    location: "Paris",
    ig: ig("benoitpeverelli"),
    images: roster("benoit-peverelli", ["h1.jpg", "h2.jpg", "h3.jpg"]),
    photo: true,
    pastWork: "Chanel backstage 2010–2019 (Steidl book) · Louis Vuitton · Fendi · Loewe · Vogue Paris",
    notes:
      "Black-and-white street portraits, polaroids and a decade backstage at Chanel.\n\nFrom the photographer library (Paris). Photographed backstage at Chanel from 2010 to Karl Lagerfeld’s last collection in March 2019, collected in a Steidl book. Clients named in promotional bios: Chanel, Louis Vuitton, Fendi, Air France, Kering, Uniqlo, Loewe; editorial for Vogue Paris, Elle, W, T Magazine and Purple, with many Elle France and Madame Figaro covers. Sources disagree on birthplace (Switzerland 1970 per Steidl, Paris 1975 per a directory). Images from the photographer library, internal use only. Sources: Steidl, Artbook, Fashion Model Directory.",
  },

  // ── 04 · Behind the scenes ───────────────────────────────────────────────────
  {
    name: "Dario Castillo",
    group: BTS,
    role: "Photographer",
    location: "New York",
    ig: ig("dariocastillostudio"),
    images: [],
    photo: true,
    pastWork: "Purple backstage: Eckhaus Latta FW24 · AREA SS24 · Stella McCartney 2026 · Nylon 2026",
    notes:
      "Venezuelan-American. Backstage at New York shows, close in and in the moment.\n\nFrom the photographer library (New York). Models.com lists Darío Castillo as New York-based, with US and Venezuelan nationality. 2026 credits: Stella McCartney social content (May) and a Nylon editorial (April). Backstage for Purple Magazine at Eckhaus Latta FW24, Zoe Gustavia Anna Whalen FW24 and AREA SS24. Not to be confused with Oscar B. Castillo or David Castillo, also photographers. Sources: models.com, Visie.",
  },
  {
    name: "Paige Powell",
    group: BTS,
    role: "Photographer and videographer",
    location: "New York",
    ig: ig("xxpaigepowell"),
    images: [],
    photo: true,
    video: true,
    pastWork: "Wonderland NYFW SS24 · Highsnobiety NYFW 2023 · Dauphinette AW24 · Polaroids Book 01",
    notes:
      "Fashion week from the inside, on film: the in-between moments shot like an editorial. New York and Los Angeles.\n\nFrom the photographer library (New York, @xxpaigepowell). Wonderland calls this Paige Powell a Los Angeles- and New York-based photographer and videographer who documents fashion week backstage (NYFW SS24 story, Oct 2023); Highsnobiety sent the same photographer to NYFW 2023 after-hours events; Polaroids Book 01 collects NYFW FW24 backstage, with Julia Fox, Irina Shayk and Paloma Elsesser. Confirm: a different Paige Powell is known for 1980s New York art-scene photographs (Warhol circle; Gucci and Dashwood box set, 2019). The handle and the Wonderland credit match; the search results mix the two. Sources: Wonderland, Highsnobiety, Contra.",
  },
  {
    name: "Gray Sorrenti",
    group: BTS,
    role: "Photographer and director",
    location: "New York",
    ig: ig("graysorrenti"),
    images: roster("gray-sorrenti", g4),
    photo: true,
    video: true,
    pastWork: "Saint Laurent · Calvin Klein · Loewe · Moncler · Nili Lotan · Dior Men · La Mer",
    notes:
      "Intimate, diaristic fashion pictures, mostly on film, from a family of image-makers. Represented by Art Partner.\n\nFrom the photographer library. New York-based photographer and director, represented by Art Partner. The Impression lists Calvin Klein, Saint Laurent, Loewe, Moncler, Rimowa and La Mer; models.com shows 2025–26 advertising for Saint Laurent, Nili Lotan, Dolce & Gabbana and Dior Men. Daughter of Mario Sorrenti; the two worked together on La Mer’s Edge of the Sea. Birth year differs by source (1996 or 2000), so left out. Instagram handle @graysorrenti is from memory; confirm. Images from the photographer library, internal use only. Sources: The Impression, Art Partner, BoF 500, models.com.",
  },
  {
    name: "Sabrina Santiago",
    group: BTS,
    role: "Photographer",
    location: "New York",
    ig: ig("_sabrinasantiago"),
    images: roster("sabrina-santiago", h4),
    photo: true,
    pastWork: "The New York Times · New York Magazine · Vanderbilt Hall, Grand Central · On Hair for Polaroid · Coahuila 52 (2024)",
    notes:
      "Street and documentary pictures of identity, community and the rituals of daily life.\n\nFrom the photographer library (New York). Street and documentary photographer; work featured by The New York Times and New York Magazine and shown at Grand Central’s Vanderbilt Hall; working on a first monograph. BA in Photography and Media Studies, NYU Gallatin (2018). On Hair was made with Polaroid Originals for the One Step+ launch; zine Coahuila 52 with Friend Editions (Nov 2024). Images from the photographer library, internal use only. Sources: ICP, Viewing NYC, i-D, Booooooom, sabrinasantiago CV.",
  },
  {
    name: "Documented by Tess",
    group: BTS,
    role: "Instagram",
    location: "",
    images: [],
    photo: true,
    pastWork: "",
    notes:
      "Added at Tess’s request. Web searches for “Documented by Tess” found no matching account, so the handle, base, a line on the work and selected clients are still to add.",
  },
  {
    name: "Vitali Gelwich",
    group: BTS,
    role: "Photographer",
    location: "Berlin",
    ig: ig("vitali_gelwich"),
    images: roster("vitali-gelwich", h4),
    photo: true,
    pastWork: "Moncler · Dior · Calvin Klein · SLEEK · Crack · Highsnobiety · Boring Book (Hatje Cantz, 2021)",
    notes:
      "Born in Russia, raised in Germany. Nightlife, documentary and portraits with a casual, unforced eye.\n\nFrom the photographer library (Berlin). Highsnobiety names Moncler, Dior and Calvin Klein among commercial clients, plus portraits such as Helena Hauff for Crack and Hyukoh for Highsnobiety; shoots regularly for SLEEK; one of five Berlin photographers W Magazine picked out. Documentary pictures and portraits for Jägermeister’s Berlin:AFT3R D4RK. Retrospective Boring Book, Hatje Cantz (2021). Largely self-taught. Client list is partial. Images from the photographer library, internal use only. Sources: Highsnobiety, SLEEK, Lampoon, W Magazine.",
  },

  // ── 05 · Directors ───────────────────────────────────────────────────────────
  {
    name: "Savanah Leaf",
    group: DIRECTORS,
    role: "Director",
    location: "",
    link: "https://parkpictures.com",
    images: [],
    photo: false,
    video: true,
    pastWork: "Earth Mama (A24, Sundance 2023) · adidas and NFL Super Bowl spots · Gary Clark Jr., “This Land” (Grammy-nominated)",
    notes:
      "A former Olympic volleyball player turned filmmaker. The debut feature Earth Mama won a BAFTA for best debut. Represented by Park Pictures.\n\nAdded at Tess’s request (spelled Savanah; some sources use Savannah). British-American director; competed for Great Britain in volleyball at the 2012 London Olympics, a natural fit for a dance- and movement-led brand. Came up through music videos and short films; represented by Park Pictures, whose roster describes work spanning narrative, commercials and art. Earth Mama, Leaf’s first feature, premiered at Sundance in 2023, was produced by A24 and Film4, and won a BAFTA for outstanding debut. Commercials include Super Bowl spots for adidas and the NFL; music videos include Gary Clark Jr., “This Land” (Grammy nomination for best music video, 2020), Jorja Smith, “Addicted”, and Mabel and Kojo Funds, “Finders Keepers”. Base not confirmed. See also Ryan Marie Helfant, director of photography, in Movement. Sources: Wikipedia, Park Pictures, LBB Online, The Hollywood Reporter, IMDb.",
  },
];

// ── Models ─────────────────────────────────────────────────────────────────────
// The deck's casting brief, on both references' cards so it travels with them.
const BRIEF =
  "Casting brief: self-assured, elegant women of New York, in their thirties. Look for a steady, direct gaze · natural hair and skin · a grounded, relaxed stance.";
const SHORTLIST = "Shortlist";
const REFERENCE = "Casting reference";
const AGES = "Ages as of October 2026.";

export const MODEL_SEED: PersonSeed[] = [
  {
    name: "Fei Fei Sun",
    group: SHORTLIST,
    age: "37",
    location: "New York",
    agency: "Elite Model Management",
    images: [],
    pastWork: "Estée Lauder global face · Valentino · Max Mara · David Yurman",
    notes: `Born 20 Mar 1989; Estée Lauder global spokesmodel since 2017, David Yurman ambassador 2024. ${AGES}`,
  },
  {
    name: "Chiharu Okunugi",
    group: SHORTLIST,
    age: "34",
    location: "New York",
    agency: "New York Model Management",
    images: [],
    pastWork: "Thom Browne shows · Tommy Hilfiger 2026 · Kith · Vogue Japan",
    notes: `Japanese, from Tokyo, born 22 May 1992 (IMDb); New York Model Management in 2014–2016 sources; models.com lists Kith (Aug 2025), Tuckernuck (2024), Thom Browne shows and a Tommy Hilfiger campaign (2026). Tess liked her look as a direction for further casting. ${AGES}`,
  },
  {
    name: "Imaan Hammam",
    group: SHORTLIST,
    age: "30",
    location: "New York",
    agency: "DNA Model Management",
    images: [],
    pastWork: "Tiffany & Co. · Estée Lauder · Donna Karan · Chanel · Celine",
    notes: `Born 5 Oct 1996; lives in Brooklyn. Estée Lauder global ambassador from 2023. ${AGES}`,
  },
  {
    name: "Julia Nobis",
    group: SHORTLIST,
    age: "34",
    location: "New York",
    agency: "DNA Model Management",
    images: [],
    pastWork: "Prada · Céline · Calvin Klein · Dior · Alaïa",
    notes: `New York and Sydney. Born 27 Jun 1992 (Vogue Australia gives 1993); began as a Calvin Klein exclusive in New York; Prada, Céline, Dior, Alaïa Fall 2023; current New York base to confirm. ${AGES}`,
  },
  {
    name: "Ali Michael",
    group: SHORTLIST,
    age: "36",
    location: "New York",
    agency: "IMG Models",
    images: [],
    pastWork: "Collina Strada show, Sept 2026 · Bal Harbour cover · Harper’s Bazaar UK",
    notes: `American, born 15 May 1990; models.com says New York-based, another profile says Los Angeles; IMG; Bal Harbour cover (Sept 2024), Harper’s Bazaar UK (June 2024), Collina Strada show (Sept 2026). ${AGES}`,
  },
  {
    name: "Ronja Furrer",
    group: SHORTLIST,
    age: "34",
    location: "New York",
    agency: "The Kinship (co-founder)",
    images: [],
    pastWork: "L’Officiel Suisse · Numéro Switzerland · Russh · Ocean Drive",
    notes: `Swiss, born 18 Jan 1992; models.com lists a New York base, and she splits time between New York and Switzerland; co-founded the Swiss agency The Kinship (2020 or 2021). ${AGES}`,
  },
  {
    name: "Ji Hye Park",
    group: SHORTLIST,
    age: "38",
    location: "New York",
    agency: "Elite New York (2012)",
    images: [],
    pastWork: "COS show 2026 · Max Mara · Narciso Rodriguez · Ralph Lauren",
    notes: `Korean, born 6 Feb 1988 in Seoul; with Elite New York in 2012; models.com lists COS (Mar 2026) and MARKGONG (Mar 2025) shows; earlier runway for Max Mara, Narciso Rodriguez, Ralph Lauren, Alexander Wang, Anna Sui; current agency and base not confirmed. ${AGES}`,
  },
  {
    name: "Tian Yi",
    group: SHORTLIST,
    age: "~32",
    location: "New York",
    images: [],
    pastWork: "Marc Jacobs show · Harper’s Bazaar China · Tatler Hong Kong",
    notes: `Chinese, from Hubei; famous at 16 after the New Silk Road contest; scouted by Fusion in New York and moved there in 2013 (Tatler); walked Marc Jacobs in 2011; age worked out from that coverage. ${AGES}`,
  },
  {
    name: "Amanda Murphy",
    group: SHORTLIST,
    age: "39",
    location: "",
    agency: "IMG Models",
    images: [],
    pastWork: "Prada muse for a decade · Prada FW26 show · four Vogue Italia covers",
    notes: `American, born 16 Nov 1986, so she turns 40 in November 2026; a Prada muse for over a decade, walked Prada FW26, four Vogue Italia covers; IMG in older listings; base not confirmed. ${AGES}`,
  },
  {
    name: "Jing Wen",
    group: SHORTLIST,
    age: "33",
    location: "",
    agency: "Women Management",
    images: [],
    pastWork: "Vogue China covers · T Magazine cover · Vogue Italia cover",
    notes: `Chinese, from Guangzhou, born 15 Oct 1993 (unverified); Women Management (New York, Paris, Milan); American Vogue, T Magazine cover, two Vogue China covers, a Vogue Italia cover; base not confirmed. ${AGES}`,
  },
  {
    name: "Maggie Maurer",
    group: SHORTLIST,
    age: "~36",
    location: "",
    images: [],
    pastWork: "Vogue Portugal cover story · Dazed · Altered States",
    notes: `American, from Potsdam, New York; born around 1990 per two profiles; older listings name Elmer Olsen and IMG; Vogue Portugal mother-issue interview, Dazed, Altered States, Union; base not confirmed. ${AGES}`,
  },
  {
    name: "Lucinda Levant",
    group: SHORTLIST,
    location: "Sydney",
    agency: "Priscillas · Elite New York",
    ig: ig("lucindalevant"),
    images: [],
    borrow: { model: "Lucinda Levant" },
    pastWork: "Michael Lo Sordo show 2025 · Aaron Crossman portraits",
    notes:
      "Also listed as Lucinda Levant-Feldman; mother agency Priscillas in Sydney, with Elite New York, Select London and Fabbrica Milan; about 178 cm; walked Michael Lo Sordo in 2025; editorial “The Sunbather” by Amy Hibbard for 5:11 Magazine. Elite New York lists her on its development board, which usually means a newer, younger model, so she may be under 30; her age isn’t public. Photo by Aaron Crossman, from the SSYNC reference; check usage before sharing outside the team.",
  },
  {
    name: "Hikari Mori",
    group: SHORTLIST,
    age: "34",
    location: "Tokyo",
    agency: "The Society Management",
    images: [],
    pastWork: "Met Gala 2018 and 2019 · granddaughter of Hanae Mori · TV host in Japan",
    notes: `Born 22 Apr 1992 in Tokyo to an American mother and Japanese father; granddaughter of the designer Hanae Mori; model, actress and TV host in Japan; The Society Management in New York; Met Gala 2018 and 2019. ${AGES}`,
  },
  {
    name: "Sunghee Kim",
    group: SHORTLIST,
    age: "40",
    location: "Seoul",
    agency: "ESteem",
    images: [],
    pastWork: "First Asian face of Miu Miu · Prada · Vogue Korea",
    notes: `Korean, born 20 Aug 1986, so 40, just past the brief’s age range; ESteem in Seoul; New York Magazine rookie to watch, fall 2013; shot for Miu Miu by Steven Meisel and described as the first Asian face of Miu Miu and Prada. ${AGES}`,
  },
  {
    name: "Alexandra Agoston",
    group: REFERENCE,
    age: "39",
    location: "New York",
    images: [],
    borrow: { id: "3d76e38b-8926-444a-9f9a-eeb5dae74fae" },
    pastWork: "FRAME, shot by Chris Colls (saved on Campaign)",
    notes: `Our casting reference, saved in SSYNC on Chris Colls’s FRAME images. New York and Paris; could be cast herself.\n\n${BRIEF}`,
  },
  {
    name: "Yilan Hua",
    group: REFERENCE,
    location: "",
    images: [],
    pastWork: "",
    notes: `Casting reference, from an image Tess shared (photographer not credited yet).\n\n${BRIEF}`,
  },
];
