const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from((root || document).querySelectorAll(sel));

const state = {
  city: "Berlin",
  location: null,
  forecast: null,
  selectedDayIndex: 0,
  tempUnit: "c",
  windUnit: "km/h",
  precipUnit: "mm"
};

const weatherCodeIcon = code => {
  // Open-Meteo codes -> fichiers locaux
  if (code === 0) return "assets/images/icon-sunny.webp";
  if ([1, 2, 3].includes(code)) return "assets/images/icon-cloudy.webp";
  if ([45, 48].includes(code)) return "assets/images/icon-fog.webp"; // sinon fallback Cloudy
  if ([51, 53, 55,23].includes(code)) return "assets/images/icon-drizzle.webp";
  if ([56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "assets/images/icon-rain.webp";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "assets/images/icon-snow.webp";
  if ([95, 96, 99].includes(code)) return "assets/images/icon-storm.webp";
  return "assets/images/icon-sunny.webp";
};

const setIcon = (imgEl, code) => {
  if (!imgEl) return;
  imgEl.src = weatherCodeIcon(code);
  imgEl.alt = `Weather code ${code}`;
  imgEl.onerror = () => {
    imgEl.onerror = null;
    imgEl.src = "assets/images/icon-sunny.webp";
    imgEl.alt = "Fallback weather icon";
  };
};

const tempText = t => (state.tempUnit === "f" ? Math.round(t * 9 / 5 + 32) : Math.round(t));
const tempSuffix = () => (state.tempUnit === "f" ? "°F" : "°C");
const windText = w => (state.windUnit === "mph" ? (w * 0.621371).toFixed(1) : w.toFixed(1));
const windSuffix = () => (state.windUnit === "mph" ? "mph" : "km/h");

const formatDate = iso => new Date(iso).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
const formatHour = iso => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

async function geocode(city) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("geocode request failed");
  const payload = await res.json();
  if (!payload.results?.length) throw new Error("city not found");
  return payload.results[0];
}

async function fetchForecast(lat, lon) {
  const q = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current_weather: "true",
    daily: "temperature_2m_max,temperature_2m_min,weathercode",
    hourly: "temperature_2m,relativehumidity_2m,windspeed_10m,precipitation,weathercode",
    timezone: "auto"
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`);
  if (!res.ok) throw new Error("forecast request failed");
  return res.json();
}

function setText(selector, value) {
  const el = $(selector);
  if (el) el.textContent = String(value);
}

function renderCurrent() {
  if (!state.forecast?.current_weather) return;
  const current = state.forecast.current_weather;

  let iconEl = $(".temperature-display img");
  if (!iconEl) {
    iconEl = document.createElement("img");
    const tempContainer = $(".temperature-display");
    if (tempContainer) tempContainer.prepend(iconEl);
  }
  setIcon(iconEl, current.weathercode);

  setText(".city-name h2", `${state.location?.name || ""}, ${state.location?.country || ""}`);
  setText(".city-name p", formatDate(current.time));
  setText(".temperature-display h1", `${tempText(current.temperature)}${tempSuffix()}`);
  setText(".weather-stats .metric:nth-of-type(1) h5", `${tempText(current.temperature)}${tempSuffix()}`);
  setText(".weather-stats .metric:nth-of-type(2) h5", `${state.forecast.hourly.relativehumidity_2m?.[0] ?? "--"}%`);
  setText(".weather-stats .metric:nth-of-type(3) h5", `${windText(current.windspeed)} ${windSuffix()}`);
  setText(".weather-stats .metric:nth-of-type(4) h5", `${state.forecast.hourly.precipitation?.[0] ?? "--"} ${state.precipUnit}`);
}

function renderDaily() {
  if (!state.forecast?.daily) return;
  const container = $(".daily-forecast-grid");
  if (!container) return;
  container.innerHTML = state.forecast.daily.time
    .map((day, i) => {
      const max = state.forecast.daily.temperature_2m_max[i];
      const min = state.forecast.daily.temperature_2m_min[i];
      const code = state.forecast.daily.weathercode[i];
      return `
        <div class="daily-forecast-item">
          <h5>${new Date(day).toLocaleDateString(undefined, { weekday: "short" })}</h5>
          <img src="${weatherCodeIcon(code)}" alt="Daily weather">
          <p><span>${tempText(max)}${tempSuffix()}</span> <span>${tempText(min)}${tempSuffix()}</span></p>
        </div>
      `;
    })
    .join("");
}

function renderHourly() {
  if (!state.forecast?.hourly || !state.forecast?.daily) return;
  const dayIso = state.forecast.daily.time[state.selectedDayIndex];
  const start = new Date(dayIso); start.setHours(0,0,0,0);
  const end = new Date(start); end.setDate(end.getDate() + 1);

  const items = [];
  state.forecast.hourly.time.forEach((iso, idx) => {
    const dt = new Date(iso);
    if (dt >= start && dt < end) {
      items.push({
        timeLabel: formatHour(iso),
        temp: tempText(state.forecast.hourly.temperature_2m[idx]),
        code: state.forecast.hourly.weathercode[idx]
      });
    }
  });

  $(".hourly-forecast-list").innerHTML = items.map(item => `
    <div class="hourly-forecast-item">
      <div class="hourly-forecast-timeblock">
        <img src="${weatherCodeIcon(item.code)}" alt="Hourly weather">
        <span>${item.timeLabel}</span>
      </div>
      <h6>${item.temp}${tempSuffix()}</h6>
    </div>
  `).join("");
}

function render() {
  renderCurrent();
  renderDaily();
  renderHourly();
}

function setDayLabels() {
  const labels = $$("input[name='days']");
  if (!state.forecast?.daily) return;
  labels.forEach((input, index) => {
    input.value = String(index);
    const labelEl = input.closest("label");
    if (labelEl && state.forecast.daily.time[index]) {
      labelEl.lastChild && labelEl.lastChild.remove();
      labelEl.appendChild(document.createTextNode(` ${new Date(state.forecast.daily.time[index]).toLocaleDateString(undefined,{ weekday:"short"})}`));
    }
  });
  const selected = labels[state.selectedDayIndex];
  if (selected) selected.checked = true;
}

async function loadWeather(city) {
  try {
    setText(".city-name h2", "Loading...");
    setText(".city-name p", "");
    setText(".temperature-display h1", "--");
    const loc = await geocode(city);
    state.location = loc;
    state.city = `${loc.name}, ${loc.country}`;
    state.forecast = await fetchForecast(loc.latitude, loc.longitude);
    state.selectedDayIndex = 0;
    setDayLabels();
    render();
    $("#days").textContent = new Date(state.forecast.daily.time[0]).toLocaleDateString(undefined,{ weekday:"long" });
  } catch {
    setText(".city-name h2", "Location not found");
    setText(".city-name p", "");
  }
}

function initDropdowns() {
  const closeAll = () => {
    $$(".dropdown").forEach(dd => {
      dd.classList.remove("dropdown--open");
      const menu = $(".menu", dd);
      if (menu) menu.hidden = true;
    });
  };

  $$(".dropdown").forEach(dd => {
    const trigger = $("button", dd);
    const menu = $(".menu", dd);
    if (!trigger || !menu) return;
    trigger.addEventListener("click", e => {
      e.stopPropagation();
      const open = !dd.classList.contains("dropdown--open");
      closeAll();
      dd.classList.toggle("dropdown--open", open);
      menu.hidden = !open;
    });
    menu.addEventListener("click", e => e.stopPropagation());
  });
  document.addEventListener("click", closeAll);
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeAll(); });
}

document.addEventListener("DOMContentLoaded", () => {
  initDropdowns();

  $(".search-form").addEventListener("submit", e => {
    e.preventDefault();
    const q = $(".search-form__input").value.trim();
    if (q) loadWeather(q);
  });

  $$("input[name='days']").forEach(input => {
    input.addEventListener("change", () => {
      state.selectedDayIndex = Number(input.value);
      const dayName = input.closest("label")?.textContent.trim();
      if (dayName) $("#days").childNodes[0].textContent = dayName;
      renderHourly();
    });
  });

  $$("input[name='temp']").forEach(input => {
    input.addEventListener("change", () => {
      state.tempUnit = input.value === "fahrenheit" ? "f" : "c";
      render();
    });
  });

  $$("input[name='wind']").forEach(input => {
    input.addEventListener("change", () => {
      state.windUnit = input.value === "mph" ? "mph" : "km/h";
      renderCurrent();
      renderHourly();
    });
  });

  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(async pos => {
      try {
        const rev = await fetch(`https://geocoding-api.open-meteo.com/v1/reverse?latitude=${pos.coords.latitude}&longitude=${pos.coords.longitude}&count=1`);
        const dest = await rev.json();
        if (dest.results?.length) state.city = dest.results[0].name;
      } catch {}
      loadWeather(state.city);
    }, () => loadWeather(state.city), { timeout: 8000 });
  } else {
    loadWeather(state.city);
  }
});