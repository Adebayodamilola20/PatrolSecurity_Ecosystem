// Create the first Tarmac admin login on the TARMAC Convex deployment only.
// Usage (from mobile/patrol_app):  node scripts/create-tarmac-admin.mjs
// The password is typed by you, hashed locally, and never printed or stored.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline";
import bcrypt from "bcryptjs";

const TARMAC_DEPLOYMENT = "gallant-crow-174";

const envLocal = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const deployment = /CONVEX_DEPLOYMENT=([^\s#]+)/.exec(envLocal)?.[1] ?? "";
if (!deployment.endsWith(TARMAC_DEPLOYMENT)) {
  console.error(`Refusing to run: this folder points at "${deployment}", not Tarmac (${TARMAC_DEPLOYMENT}).`);
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

// Hidden input without readline (readline's masking does not show the prompt
// in every terminal). Typed characters are not echoed.
const askHidden = (q) =>
  new Promise((res) => {
    process.stdout.write(q);
    const stdin = process.stdin;
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    const onData = (buf) => {
      for (const ch of buf.toString("utf8")) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          res(value);
          return;
        }
        if (ch === "\u0003") process.exit(1); // Ctrl+C
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on("data", onData);
  });

const name = (await ask("Admin full name: ")).trim();
const email = (await ask("Admin email: ")).trim().toLowerCase();
const phone = (await ask("Admin phone (e.g. 08031234567): ")).trim();
rl.close();
const password = await askHidden("Password (8+ chars, upper + lower case + number, typing is hidden): ");
const confirm = await askHidden("Repeat password: ");

if (!name || !email.includes("@")) { console.error("Name and a valid email are required."); process.exit(1); }
// Same rule as the backend's passwordPolicyError (convex/http.ts).
if (password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
  console.error("Password must be at least 8 characters with a lowercase letter, an uppercase letter and a number.");
  process.exit(1);
}
if (password !== confirm) { console.error("Passwords do not match."); process.exit(1); }

const passwordHash = await bcrypt.hash(password, 10);
const args = JSON.stringify({
  name, email, phone, passwordHash,
  role: "admin", active: true, liveTracking: false, createdAt: Date.now(),
});
execFileSync("npx", ["convex", "run", "users:create", args], { stdio: ["ignore", "inherit", "inherit"] });
console.log(`\nTarmac admin created: ${email}\nLog in at https://tarmac-admin.vercel.app`);
