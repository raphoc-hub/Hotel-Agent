// Guest page: the weather strip and the message form.

const FORECAST_URL =
  "https://api.open-meteo.com/v1/forecast?latitude=41.39&longitude=2.17&daily=temperature_2m_max,precipitation_probability_max&timezone=Europe%2FMadrid&forecast_days=7";

async function loadForecast() {
  const list = document.getElementById("forecast");
  const status = document.getElementById("forecast-status");
  try {
    const response = await fetch(FORECAST_URL);
    const data = await response.json();
    const days = data.daily;
    days.time.forEach((date, i) => {
      // "2026-11-06" -> "Fri 6 Nov"; the first date is today in Barcelona
      const label = new Date(date + "T12:00:00").toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
      const item = document.createElement("li");
      item.innerHTML = `
        <div class="day">${label}</div>
        <div class="temp">${Math.round(days.temperature_2m_max[i])}&deg;C</div>
        <div class="rain">${days.precipitation_probability_max[i]}% rain</div>`;
      list.appendChild(item);
    });
    status.hidden = true;
  } catch {
    status.textContent = "The forecast is not available right now.";
  }
}

async function sendMessage(event) {
  event.preventDefault();
  const form = event.target;
  const button = document.getElementById("send");
  const reply = document.getElementById("reply");

  const fields = {
    name: form.name.value.trim(),
    email: form.email.value.trim(),
    message: form.message.value.trim(),
  };

  button.disabled = true;
  button.textContent = "Sending";
  reply.hidden = false;
  reply.classList.remove("error");
  reply.textContent = "One moment, please.";

  try {
    const response = await fetch("/api/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    reply.textContent = data.reply;
  } catch (err) {
    reply.classList.add("error");
    reply.textContent = err.message || "Sorry, something went wrong. Please try again in a moment.";
  } finally {
    button.disabled = false;
    button.textContent = "Send";
  }
}

loadForecast();
document.getElementById("message-form").addEventListener("submit", sendMessage);
