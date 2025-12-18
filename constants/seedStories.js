const { pool } = require("../util/db");
const cloudinary = require("../config/cloudinary");
const path = require("path");

const stories = [
  {
    slug: "broken-cycle",
    title: "The Broken Cycle",
    description:
      "Arjun learns how anger spreads and decides to break the cycle with kindness.",
    image: "cycle.png",
    paragraphs: [
      "Arjun was often shouted at by his Vater (father) who came home tired and stressed.",
      "One Tag (day), Arjun shouted at a younger boy, Ravi, making him weinen (cry).",
      "His Lehrerin (teacher) explained that anger passes from one Person (person) to another — a Zyklus (cycle).",
      "Arjun understood and decided to brechen (break) the cycle.",
      "When his father shouted again, Arjun responded freundlich (kindly).",
      "His father's Herz (heart) softened, and things began to ändern (change).",
      "Arjun also treated Ravi gently the next time he made a mistake.",
    ],
  },

  {
    slug: "priyas-honest-answer",
    title: "Priya's Honest Answer",
    description:
      "A touching story of honesty, friendship, and doing the right thing.",
    image: "priya.png",
    paragraphs: [
      "Priya, a very intelligent Mädchen (girl), wanted to win an Essay Wettbewerb (competition) with a Laptop prize.",
      "On the Tag (day) of submission, her friend Maya cried because she forgot her essay at Haus (house).",
      "Priya gave Maya her own essay and said she would say hers was forgotten.",
      "Maya won, but later confessed the Wahrheit (truth) to the Schulleiter (principal).",
      "Priya received a full Stipendium (scholarship) for her Bildung (education).",
      "She learned honesty always brings the best Belohnung (reward).",
    ],
  },

  {
    slug: "thieves-treasure",
    title: "The Thieves and the Treasure",
    description:
      "Tenali Rama tricks two thieves who try to steal from his house.",
    image: "thieves.png",
    paragraphs: [
      "Two Diebe (thieves) entered Tenali's Haus (house) one Nacht (night).",
      "Tenali pretended to tell his wife that he verwandle (transforms) gold into Steine (stones) at Nacht (night).",
      "The thieves believed him and carried all the Steine (stones) out of the house.",
      "They waited for them to verwandeln (transform) into gold — but nothing happened.",
      "Tenali laughed, realizing they had removed all his useless junk.",
      "The thieves worked die ganze Nacht (the whole night) for nothing.",
    ],
  },

  {
    slug: "greatest-poet",
    title: "The Greatest Poet",
    description:
      "A proud poet challenges the king's court, but Tenali Rama teaches him a lesson.",
    image: "poet.png",
    paragraphs: [
      "A proud Dichter (poet) arrived at King Krishnadevaraya's Hof (court) and claimed to be the greatest in the Welt (world).",
      "He challenged poets to a Wettbewerb (competition) with 1000 gold Münzen (coins).",
      "Tenali Rama accepted the challenge, dressed like a verrückt (crazy) farmer.",
      "The poet recited a beautiful Gedicht (poem), but Tenali replied with nonsense in a strange Sprache (language).",
      "When the poet couldn't verstehen (understand) it, Tenali said, “If you cannot understand mine, you lose!”",
      "The court laughed. The poet realized he was tricked and left quietly.",
    ],
  },

  {
    slug: "elephant-and-mice",
    title: "The Elephant and the Mice",
    description:
      "A story about kindness and how even the smallest creatures can help.",
    image: "elephant.png",
    paragraphs: [
      "Near a forest, a groß (big) See (lake) was home to a Gruppe (group) of elephants.",
      "On their Weg (way) to the lake, they often crushed the Mäuse (mice) living in small Löcher (holes).",
      "The mouse king requested the elephants to nehmen (take) another path.",
      "The elephants agreed and avoided the village thereafter.",
      "One Tag (day), Jäger (hunters) trapped the elephants in heavy nets.",
      "The mice came at Nacht (night) and nagen (gnawed) the ropes with their sharp Zähne (teeth).",
      "By Morgen (morning), the elephants were frei (free) and thanked the tiny mice.",
    ],
  },

  {
    slug: "blue-jackal",
    title: "The Blue Jackal",
    description:
      "A jackal pretends to be a king after falling into blue paint but learns a lesson.",
    image: "jackal.png",
    paragraphs: [
      "Chanakya, a hungry Schakal (jackal), ran into a Dorf (village) one Tag (day) searching for food.",
      "Angry Hunde (dogs) chased him, so he jumped into a vat of blue Farbe (paint).",
      "When he came out, his ganzer Körper (entire body) was blau (blue). He had an Idee (idea).",
      "He went to the forest and declared, “I am sent by Gott (God). I am your new König (king).”",
      "The Tiere (animals) believed him. The Löwe (lion), elephant, and tiger all showed Respekt (respect).",
      "But one Nacht (night), he accidentally howled like a jackal — “Aoooo!”",
      "The Tiere realized he was a fake and chased him aus (out of) the forest.",
    ],
  },

  {
    slug: "monkey-and-crocodile",
    title: "The Monkey and the Crocodile",
    description:
      "A clever monkey escapes danger using intelligence, learning German words along the way.",
    image: "monkey.png",
    paragraphs: [
      "Ravi was a clever Affe (monkey) who lived on a Baum (tree) near the river. Every Tag (day), he would essen (eat) sweet fruits and enjoy the sunshine.",
      "One morning, a Krokodil (crocodile) swam to the tree and said, “Hallo (hello)! I am sehr (very) hungry. Can you geben (give) me some fruits?”",
      "Ravi was freundlich (friendly) and threw down mangoes. The crocodile said “Danke (thank you)!” and they soon became Freunde (friends).",
      "But the crocodile's Frau (wife) was jealous. She wanted Ravi's Herz (heart) and told her Mann (husband) to bring it.",
      "The crocodile invited Ravi to his Haus (house). Halfway through the river, he confessed that his wife wanted to essen (eat) Ravi's heart.",
      "Ravi acted clever. He said he left his heart on the Baum (tree) for safety and they must go zurück (back).",
      "Once they reached land, Ravi schnell (quickly) climbed up and shouted, “A true Freund (friend) never tries to kill!”",
    ],
  },

  {
    slug: "arrival-in-a-new-land",
    title: "Arrival in a New Land",
    description:
      "Priya, a nurse from India, arrives in Germany and learns basic German phrases while navigating the airport.",
    image: "arrival.jpeg",
    paragraphs: [
      "die (The) flight was long. Priya, a nurse aus (from) India, looked out die (the) window as die (the) plane landed. She was finally in (in) Deutschland (Germany). This was a new das Land (Country) for her. She wanted to start a new life.",

      'She walked through die (the) airport. It was a big die Stadt (City). She felt small. She needed to find a bus. She saw a sign but could not lesen (read) die (the) der Text (Text). "Entschuldigung, noch einmal, bitte. (Excuse me, once again please)," she practiced silently.',

      "She walked outside. die (The) air was cold. She checked her die Handynummer (Mobile number) on her phone to see if it worked. Yes. She saw a die Person (Person) waiting. He was an older man.",

      '"Hallo! (Hello!)" she said. "Guten Tag! (Good day!)" he replied. "mein (My) der Name (Name) is Priya," she said. "I kommen (Come) aus (From) India." "Welcome," he said. "mein (My) der Name (Name) is Hans. I kommen (Come) aus (From) Deutschland (Germany)."',

      'Priya smiled. "I lernen (Learn) die (the) die Sprache (Language)," she said. "But I sprechen (Speak) only a little Deutsch (German)." "Sehr gut. (Very good)," Hans said. "Welche Sprachen sprechen Sie? (Which languages do you speak?)" "I sprechen (Speak) English and Hindi," she said. "I sprechen (Speak) Deutsch (German)," Hans said. "And I lernen (Learn) English."',

      'They laughed. "wo (Where) do you live?" Hans asked. "I live in (in) die (the) die Stadt (City)," Priya said. "But I don\'t know wo (where) to go. I look for die (the) bus." "I help you," Hans said. "I notieren (note) die (the) die Telefonnummer (Telephone number) of die (the) taxi for you. Or we wait for die (the) bus." "Danke, gut. (Thanks, good)," Priya said.',

      'Hans showed her a picture. "This is mein (my) die Partnerin (Partner). She is in (in) Österreich (Austria) now. And mein (my) son is in (in) die Schweiz (Switzerland)." "Nice," Priya said. "Wie geht\'s? (How are you?)" Hans asked. "Ganz gut. (Quite good)," Priya said. "A bit nervous." "Don\'t worry," Hans said. "Deutschland (Germany) is nice. die (The) die Personen (People) are nice."',

      'He wrote on a paper. "eins (One), zwei (Two), drei (Three)... these are die (the) die Zahlen (Numbers) of die (the) bus lines." "Bitte ein bisschen langsamer. (Please, a bit slower)," Priya said. "Das verstehe ich nicht. (I don\'t understand that.)" Hans smiled. "Okay. Bus die Zahl (Number) fünf (Five). Or Bus die Zahl (Number) zehn (Ten)." "Danke. (Thanks)," Priya said.',

      '"Auf Wiedersehen! (Goodbye!)" Hans said as die (the) bus came. "Bis bald! (See you soon!)" Priya waved. "Tschüs! (Bye!)"',

      'She sat in (in) die (the) bus. She looked at die (the) die Stadt (City). She felt happy. "Guten Abend! (Good evening!)" she said to die (the) driver. "Guten Abend," he said. Priya closed her eyes. She was ready. Gute Nacht! (Good night!)',
    ],
  },

  {
    slug: "meeting-at-the-cafe",
    title: "Meeting at the Café",
    description:
      "A group of friends meet at a café and discuss their hobbies, jobs, and weekly schedules while learning German vocabulary.",
    image: "cafe.jpeg",
    paragraphs: [
      "It was a beautiful Samstag (Saturday). A group von (of) friends met bei (at) a small das Café (Café) in the city. There were four die Leute (People): Sarah, Tom, Lisa, and Mark. They were good friends.",

      '"Do you freihaben (have time off) today?" Sarah asked. "ja (Yes), I am free," Tom said. "I do not arbeiten (work) today." Tom was a der Journalist (Journalist). He wrote many texts. But today he wanted to relax.',

      '"What is your das Hobby (Hobby)?" Lisa asked Mark. Lisa was a die Mechanikerin (Mechanic). She worked with cars. "My das Hobby (Hobby) is der Fußball (Football)," Mark said. "I play der Fußball (Football) every Dienstag (Tuesday) and Donnerstag (Thursday)."',

      '"wirklich (Really)?" Sarah asked. Sarah was a der Friseur (Hairdresser). "I don\'t like der Fußball (Football). I prefer die Musik (Music). I singen (sing) and tanzen (dance)."',

      '"I love die Musik (Music) too," Tom said. "On Freitag (Friday), I gehen (go) to the das Kino (Cinema) or the das Theater (Theater). I love films."',

      '"I like to reisen (Travel)," Lisa said. "I reisen (travel) to many countries. I fotografieren (take photos). Photography is my das Hobby (Hobby)."',

      '"I like to kochen (Cook)," Mark said. "I am not a professional der Koch (Cook/Chef), but I kochen (cook) for my family on Sonntag (Sunday)."',

      '"I like to schwimmen (Swim)," Sarah said. "I gehen (go) to the das Schwimmbad (Swimming pool) on Montag (Monday) and Mittwoch (Wednesday). It is good for my health."',

      "They ordered coffee. The die Kellnerin (Waitress) brought their drinks.",

      '"wann (When) do we meet again?" Tom asked. "Do we have an der Termin (Appointment) for next die Woche (week)?" "I am busy on Montag (Monday)," Lisa said. "I have a long working der Tag (day)." "What about Mittwoch (Wednesday)?" Mark asked. "nein (No), on Mittwoch (Wednesday) I Tennis spielen (play Tennis)," Sarah said. "I Tennis spielen (play Tennis) with my sister."',

      '"Okay, let\'s meet on Freitag (Friday) night," Tom suggested. "We can gehen (go) to the das Museum (Museum)." "The das Museum (Museum)?" Lisa asked. "Is it open nachts (at night)?" "ja (Yes), meistens (mostly)," Tom said. "Or we gehen (go) to a Concert." "toll (Great) idea," alle (everyone) said.',

      'Suddenly, Mark looked worried. "Where is my der Schlüssel (Key)?" he asked. "I suchen (search) for my der Schlüssel (Key)." He looked under the table. He looked in his bag. "Is it in your jacket?" Sarah asked. Mark checked his pockets. "nein (No). Oh warten (wait). hier (Here) it is. It was near my der Computer (Computer)." He laughed. He had his laptop with him. "You always lose your things," Lisa laughed. "Last die Woche (week) it was your das Wörterbuch (Dictionary)." "ja (Yes), I know," Mark said.',

      '"By the way," Tom said. "I need some die Information (Information). I need to fill out a das Formular (Form) for a neu (new) das Zimmer (Room). I need your die Adresse (Address)." "Why?" Sarah asked. "I want to send you an invitation," Tom smiled. "For my birthday party."',

      '"Oh! wann (When) is your das Geburtsdatum (Date of birth)?" Lisa asked. "Next month," Tom said. "I will be thirty years alt (old)." "Happy early birthday!" they said.',

      'Tom took a die Notiz (Note). He wrote down their names and addresses. "What is your die Postleitzahl (Postal code)?" he asked Sarah. "It is 12345," Sarah said. "And your die Hausnummer (House number)?" "Number 10," she said. "And the die Straße (Street)?" "Main die Straße (Street)," she said.',

      '"Okay, I have the die Information (Information)," Tom said. "der Familienname (Surname), der Wohnort (Place of residence), everything."',

      '"Good," Mark said. "Now, let\'s joggen (Jog). The weather is nice." "joggen (Jog)?" Sarah asked. "Now?" "ja (Yes), let\'s gehen (go)!" Mark said.',

      '"Okay, let\'s gehen (go)," they agreed. They paid the bill and left the das Café (Café).',
    ],
  },

  {
    slug: "a-day-in-the-city",
    title: "A Day in the City",
    description:
      "Anna and Marco explore a German city as tourists, learning vocabulary about places, directions, and transportation.",
    image: "city.jpeg",
    paragraphs: [
      'It was a schön (beautiful) day in der Mai (May). The sun was shining. Anna and Marco were tourists. They were happy. "so ein Glück! (Such luck!)" Anna said. "The weather is schön (beautiful)."',

      'They were at the der Bahnhof (Train station). They looked at a der Plan (Plan/Map). "wo (Where) is the das Hotel (Hotel)?" Marco asked. "Is it far?" "No," Anna said. "It is in the die Mitte (Middle) of the city."',

      'They took a taxi. "To the der Markt (Market), please," Marco said. They drove through the city. They saw many die Häuser (Houses). "Look!" Anna said. "Das ist (That is) the das Rathaus (Town hall). And da ist (there is) the die Kirche (Church)." "It is very interessant (interesting)," Marco said.',

      'They stopped at the der Markt (Market). It was busy. Many die Menschen (People) were da (there). "Let\'s gehen (go) to the der Hafen (Harbor)," Anna suggested. "How do we gehen (go)?" Marco asked. "By der Bus (Bus) or by die U-Bahn (Subway)?" "Let\'s take the das Fahrrad (Bicycle)," Anna said. "Or we gehen (go) on foot."',

      'They walked. "Where is the der Weg (Way)?" Marco asked. "gehen (Go) geradeaus (Straight ahead)," a stranger said. "Then gehen (go) links (Left). Then gehen (go) rechts (Right)." "Thank you," they said.',

      'They arrived at the der Hafen (Harbor). They saw a das Schiff (Ship) on the der Fluss (River). It was big. "Look at the die Brücke (Bridge)," Anna said. "And the der Turm (Tower)." "Do you sehen (see) the der See (Lake)?" Marco asked. "No, Das ist (that is) the das Meer (Sea)," Anna laughed. "Ah, richtig (correct)," Marco smiled.',

      'They visited a das Museum (Museum). da (There) was an die Ausstellung (Exhibition) about history. "I finden (find) it interessant (interesting)," Anna said.',

      'Later, they went to a das Konzerthaus (Concert hall). They looked at a das Plakat (Poster). "Da ist (There is) a der Film (Film) tonight," Marco said. "With a famous der Schauspieler (Actor) and die Schauspielerin (Actress)." "Great," Anna said. "I love die Filme (Films)."',

      '"Is it in the der Sommer (Summer) or der Herbst (Autumn)?" Marco joked. "It is der Frühling (Spring)," Anna said. "der Monat (Month) of der Mai (May)."',

      'They took the die Straßenbahn (Tram) back to the das Hotel (Hotel). "Tomorrow we take the der Zug (Train)," Marco said. "We visit the big das Haus (House)." "okay (Okay)," Anna said. "Good night."',
    ],
  },
];
async function seedStories() {
  try {
    console.log("🌱 Starting story seeding...");
    for (const s of stories) {
      // Check if story already exists
      const checkQuery = "SELECT * FROM story WHERE slug = $1";
      const exists = await pool.query(checkQuery, [s.slug]);
      if (exists.rows.length > 0) {
        console.log(` ${s.slug} already exists. Skipping...`);
        continue;
      }
      // Upload image to Cloudinary
      const absoluteImagePath = path.resolve(__dirname, "../public", s.image);
      console.log(`Uploading image: ${s.image}`);

      const imageRes = await cloudinary.uploader.upload(absoluteImagePath, {
        folder: "skillcase-stories",
      });

      const storyText = s.paragraphs.join("\n\n");

      // Insert into PostgreSQL
      const insertQuery = `
        INSERT INTO story (slug, title, description, cover_image_url, hero_image_url, story)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;
      const result = await pool.query(insertQuery, [
        s.slug,
        s.title,
        s.description,
        imageRes.secure_url,
        imageRes.secure_url,
        storyText,
      ]);
      console.log(`Seeded: ${result.rows[0].title}`);
    }
    console.log("\nAll stories seeded successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Error in seeding:", error);
    process.exit(1);
  }
}
seedStories();
