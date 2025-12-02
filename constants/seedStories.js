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
