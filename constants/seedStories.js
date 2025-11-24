const { pool } = require("../util/db");
const cloudinary = require("../config/cloudinary");
const path = require("path");

const stories = [
  {
    slug: "akshay-journey",
    title: "Akshay's Journey to Deutschland",
    description:
      "A nurse from India who learns Deutsch and builds a new life in Germany.",
    image: "akshay.png",
    paragraphs: [
      "Akshay was born in a small town in India. Coming from a poor Familie (family), he understood hardship early. His father worked in a factory, and his Frau (mother) managed the home with limited means.",
      "He became a Kranke-care expert — a nursing professional in a local hospital. Every day, he would sprechen (to speak) with patients, hören (to hear) their problems, notieren (note) symptoms, and ergänzen (add) reports.",
      "One day, a Herr (gentleman) from Deutschland visited the hospital wearing an elegant Anzug (suit). He spoke Deutsch (German) fluently.",
      "From that day, Akshay decided to lernen (learn) Deutsch. He made a Tabelle (table) of new words and used a Telefon (phone) dictionary.",
      "Soon, he applied for a position in Deutschland (Germany). The Interview was tough, but Akshay answered every Frage (question) clearly.",
      "He finally moved to Deutschland, where his Hausnummer (house number) and Postleitzahl (postal code) were registered by the agency.",
      "Akshay worked hard, completed a Spezialisierung (specialisation), and earned sehr (very) well.",
    ],
  },
  {
    slug: "maria-first-day",
    title: "Maria's First Day in the Krankenhaus",
    description:
      "Maria starts her nursing job in a German hospital and learns important German words.",
    image: "maria.png",
    paragraphs: [
      "Maria arrived at the Krankenhaus (hospital) full of excitement. She greeted everyone with a polite Guten (good) Morgen (morning).",
      "Her supervisor, a freundliche (friendly) Schwester (nurse), welcomed her warmly.",
      "During her rounds, Maria checked Patientenakten (records) and ensured every Medikament (medicine) was correct.",
      'A patient asked, "Wasser (water), bitte (please)?" Maria smiled and replied, "Natürlich (of course)."',
      "At lunchtime, she ate a fresh Salat (salad) in the Kantine (canteen) and talked about her Heimat (home).",
      "By evening, Maria felt müde (tired) but glücklich (happy). She had survived her first day!",
    ],
  },
  {
    slug: "rahul-train-journey",
    title: "Rahul's Train Journey Across Germany",
    description:
      "Rahul travels across Germany and learns useful travel vocabulary along the way.",
    image: "rahul.png",
    paragraphs: [
      "Rahul boarded the Zug (train) in Berlin and found his Sitzplatz (seat) while looking out of the Fenster (window).",
      'When the Schaffner (conductor) arrived, Rahul said, "Hier (here) ist mein Ticket (ticket)."',
      "He enjoyed the schöne (beautiful) Landschaft (landscape) and the Ruhe (quiet) inside the cabin.",
      "At Leipzig station, a Durchsage (announcement) said the Zug (train) had a small Verspätung (delay).",
      "Rahul bought a Brezel (pretzel) and a Kaffee (coffee) while waiting.",
      "His Reise (journey) was lang (long) but wunderschön (beautiful), and he promised to travel more.",
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
