// Guest page: the local time, the weather strip and the message form.

const FORECAST_URL =
  "https://api.open-meteo.com/v1/forecast?latitude=41.39&longitude=2.17&daily=temperature_2m_max,precipitation_probability_max&timezone=Europe%2FMadrid&forecast_days=7";

const STAR_PATH = "M12 1.5l2.6 7.9H23l-6.8 4.9 2.6 8-6.8-4.9-6.8 4.9 2.6-8L1 9.4h8.4z";
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- Local time in Barcelona ----------

function showLocalTime() {
  const time = new Date().toLocaleTimeString("en-GB", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
  });
  document.getElementById("local-time").textContent = `${time} in Barcelona`;
}

// ---------- Weather strip ----------

// A small line icon: sun, sun with cloud, or rain, from the chance of rain.
function weatherIcon(rainChance) {
  const sun = '<g class="sun"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></g>';
  const partly = '<g class="sun"><circle cx="9" cy="9" r="3.2"/><path d="M9 2.8v1.4M2.8 9h1.4M4.6 4.6l1 1M13.4 4.6l-1 1"/></g><path d="M8 19h9a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6 1.2A2.9 2.9 0 0 0 8 19z"/>';
  const rain = '<path d="M7 15h10a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6 1.2A2.9 2.9 0 0 0 7 15z"/><path d="M9 18l-1 2.5M13 18l-1 2.5M17 18l-1 2.5"/>';
  const shape = rainChance < 20 ? sun : rainChance < 50 ? partly : rain;
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${shape}</svg>`;
}

async function loadForecast() {
  const list = document.getElementById("forecast");
  const status = document.getElementById("forecast-status");
  try {
    const response = await fetch(FORECAST_URL);
    const data = await response.json();
    const days = data.daily;
    const temps = days.temperature_2m_max;
    const coolest = Math.min(...temps);
    const warmest = Math.max(...temps);

    days.time.forEach((date, i) => {
      // The first date is today in Barcelona
      const day = new Date(date + "T12:00:00");
      const weekday = i === 0 ? "Today" : day.toLocaleDateString("en-GB", { weekday: "short" });
      const dayMonth = day.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      const temp = Math.round(temps[i]);
      const rain = days.precipitation_probability_max[i];
      // Bar length: this day's maximum compared with the rest of the week
      const share = warmest === coolest ? 100 : 25 + (75 * (temps[i] - coolest)) / (warmest - coolest);

      const item = document.createElement("li");
      if (i === 0) item.classList.add("today");
      item.style.animationDelay = `${i * 60}ms`;
      item.setAttribute("aria-label", `${weekday} ${dayMonth}: up to ${temp} degrees, ${rain}% chance of rain`);
      item.innerHTML = `
        <span class="day">${weekday}</span>
        <span class="date">${dayMonth}</span>
        ${weatherIcon(rain)}
        <span class="temp">${temp}&deg;</span>
        <span class="bar"><span data-width="${share}%"></span></span>
        <span class="rain">${rain}% rain</span>`;
      list.appendChild(item);
    });
    status.hidden = true;

    // Grow the bars after the cards have appeared
    requestAnimationFrame(() => {
      list.querySelectorAll(".bar span").forEach((bar) => (bar.style.width = bar.dataset.width));
    });
  } catch {
    status.textContent = "The forecast is not available right now.";
  }
}

// ---------- The conversation ----------

function addBubble(kind, author, text) {
  const thread = document.getElementById("thread");
  const bubble = document.createElement("div");
  bubble.className = `bubble ${kind}`;

  const who = document.createElement("div");
  who.className = "who";
  if (kind === "guest") {
    who.textContent = author.trim().charAt(0).toUpperCase();
  } else {
    who.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`;
  }

  const body = document.createElement("div");
  body.className = "body";
  const meta = document.createElement("p");
  meta.className = "meta";
  const name = document.createElement("strong");
  name.textContent = author;
  meta.append(name, new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
  const content = document.createElement("p");
  content.className = "text";
  if (text) content.textContent = text; // textContent: never treated as HTML
  body.append(meta, content);

  bubble.append(who, body);
  thread.appendChild(bubble);
  return content;
}

function showTyping(content) {
  content.innerHTML = '<span class="typing" aria-label="Writing"><i></i><i></i><i></i></span>';
}

// Show the reply word by word, like someone writing it.
function revealReply(content, text) {
  content.textContent = "";
  if (reduceMotion) {
    content.textContent = text;
    return;
  }
  const words = text.split(/(\s+)/);
  words.forEach((part, i) => {
    if (/^\s+$/.test(part)) {
      content.appendChild(document.createTextNode(part));
      return;
    }
    const word = document.createElement("span");
    word.className = "word";
    word.textContent = part;
    word.style.animationDelay = `${Math.min(i * 14, 2400)}ms`;
    content.appendChild(word);
  });
}

// ---------- The form ----------

function checkFields(form) {
  let firstInvalid = null;
  for (const input of form.querySelectorAll("input, textarea")) {
    const ok = input.value.trim() !== "" && input.checkValidity();
    input.closest(".field").classList.toggle("invalid", !ok);
    if (!ok && !firstInvalid) firstInvalid = input;
  }
  return firstInvalid;
}

async function sendMessage(event) {
  event.preventDefault();
  const form = document.getElementById("message-form");
  const button = document.getElementById("send");
  const formError = document.getElementById("form-error");

  // All three fields are required, and the e-mail must look like one
  const invalid = checkFields(form);
  if (invalid) {
    formError.textContent = "Please fill in your name, a valid e-mail and your message.";
    formError.hidden = false;
    invalid.focus();
    return;
  }
  formError.hidden = true;

  const fields = {
    name: form.name.value.trim(),
    email: form.email.value.trim(),
    message: form.message.value.trim(),
  };

  button.disabled = true;
  button.querySelector(".label").textContent = "Sending";
  addBubble("guest", fields.name, fields.message);
  const reply = addBubble("hotel", "Hotel Estrella", "");
  showTyping(reply);
  reply.closest(".bubble").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });

  try {
    const response = await fetch("/api/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    revealReply(reply, data.reply);
    form.message.value = ""; // keep name and e-mail for the next message
  } catch (err) {
    reply.closest(".bubble").classList.add("error");
    reply.textContent = err.message || "Sorry, something went wrong. Please try again in a moment.";
  } finally {
    button.disabled = false;
    button.querySelector(".label").textContent = "Send";
  }
}

const form = document.getElementById("message-form");
form.addEventListener("submit", sendMessage);

// Ctrl+Enter (or Cmd+Enter on a Mac) in the message box sends it
form.message.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) form.requestSubmit();
});

// A field stops being marked once the guest fixes it
form.addEventListener("input", (event) => {
  const field = event.target.closest(".field");
  if (field && event.target.value.trim() !== "") field.classList.remove("invalid");
});

// Show "Cmd" instead of "Ctrl" on a Mac
if (/Mac|iPhone|iPad/.test(navigator.platform)) {
  document.querySelector(".shortcut kbd").textContent = "Cmd";
}

showLocalTime();
setInterval(showLocalTime, 30000);
loadForecast();
