# M365 Calendar Widget — Debugging Guide

Dotyczy: `domain/calendar/m365.js`, `domain/ui/header.css`, `uploader/m365-calendar.js`

---

## Architektura

- **Frontend widget**: `domain/calendar/m365.js` — inicjalizacja, event listenery, renderowanie agendy i detali spotkania, silnik alertów dźwiękowych.
- **Serwer ICS**: `uploader/m365-calendar.js` — pobieranie i parsowanie feedu ICS z Outlook365, cache 60s, filtrowanie/sortowanie eventów.
- **Endpointy**: `uploader/server.js` obsługuje `/api/m365/*` — proxy do serwera Node na porcie 3001.
- **Testy**: `tests/uploader/m365/calendar-logic.test.js` i `server-calendar.test.js` — uruchamiać przez `node --test tests/uploader/m365/*.test.js`.

---

## Funkcja alertu dźwiękowego (bell notification)

### Zachowanie
- **Okno alertu**: od `start - 3 minuty` do `start + 3 minuty`.
- W tym oknie odgrywa się dźwięk "Ding… Dong" (Web Audio API) co 4 sekundy.
- Ikona 🔔 pojawia się obok przycisku Join w widoku compact.
- Kliknięcie 🔔 wycisza dźwięk → ikona zmienia się na 🔕 (przezroczysta).
- Kliknięcie 🔕 ponownie włącza dźwięk (`alertMutedForId` → `null`).
- Po opuszczeniu okna alertu wszystko resetuje się; nowe spotkanie zaczyna od nowa bez wyciszenia.

### Kluczowe funkcje w `m365.js`
| Funkcja | Opis |
|---------|------|
| `_m365CheckAlertState()` | Sprawdza co 10 s czy jesteśmy w oknie alertu; uruchamia/zatrzymuje pętlę dźwięku |
| `_m365StartAlertLoop()` | Odgrywa dźwięk natychmiast i co 4 s |
| `_m365StopAlertLoop()` | Czyści interval dźwięku |
| `_m365PlayBell()` | Syntezuje dwa tony (880Hz + 660Hz) przez Web Audio API |
| `_m365ToggleBellMute()` | Przełącza wyciszenie dla bieżącego spotkania |
| `_m365GetAudioContext()` | Leniwe tworzenie/reużywanie `AudioContext` |

### Stan alertu w `_m365State`
```js
alertWindowActive: false,  // true gdy jesteśmy w oknie ±3min
alertMutedForId: null,     // ID spotkania, które zostało wyciszone
alertSoundTimer: null,     // interval dźwięku (co 4s)
alertCheckTimer: null,     // interval sprawdzający okno alertu (co 10s)
```

### Dźwięk — Web Audio API
- Nie wymaga zewnętrznych plików — w pełni darmowy komercyjnie.
- Wzorzec: "Ding" (880 Hz, 450ms) → pauza 100ms → "Dong" (660 Hz, 450ms) → pauza ~3s → powtórka.
- `AudioContext` jest tworzony leniwie przy pierwszej próbie odtworzenia.
- Jeśli przeglądarka blokuje audio (brak gestu użytkownika), dźwięk nie gra — ikona dzwonka nadal się pojawia.

### CSS (w `domain/ui/header.css`)
- `.m365-bell-btn` — bazowy styl dzwonka z animacją dzwonienia (`@keyframes m365-bell-ring`).
- `.m365-bell-btn--muted` — wyłącza animację, zmniejsza opacity do 0.4.
- `@media (prefers-reduced-motion: reduce)` — wyłącza animację.

### ICONS (w `domain/core/state.js`)
- `ICONS.bell` = `'🔔'`
- `ICONS.bellMuted` = `'🔕'`

---

## Znane błędy i ich naprawy

### 1. Popover nie wyświetla się po kliknięciu (race condition)

**Symptom**: Kliknięcie na box kalendarza powoduje krótkie miganie loadera, po czym popover znika.

**Przyczyna**: Listener `click` wykrywał kliknięcie jako "outside" ponieważ `event.target.closest()` sprawdza aktualny DOM — który może być zmutowany przez `_m365LoadAgenda()` podczas asynchronicznego re-renderu.

**Naprawa**: Zamienić `event.target.closest()` na `event.composedPath()` — ta metoda zwraca niezmienną migawkę ścieżki eventu w momencie jego wystrzelenia.

```javascript
document.addEventListener('click', (event) => {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    const target = event.target;

    // fallback dla przeglądarek bez composedPath
    if (!path.length && target instanceof Element) {
        if (target.closest('#m365DetailsPopover')) return;
        if (!target.closest('.header-m365-col')) _m365HideAgenda();
        return;
    }

    const clickedInsideDetails = path.some((node) => node instanceof Element && node.id === 'm365DetailsPopover');
    if (clickedInsideDetails) return;

    const clickedInsideM365 = path.some((node) => node instanceof Element && (
        node.classList.contains('header-m365-col')
        || node.id === 'm365Compact'
        || node.id === 'm365AgendaPopover'
        || node.id === 'm365AgendaBody'
    ));

    if (!clickedInsideM365) _m365HideAgenda();
});
```

**Zasada ogólna**: Jeśli DOM jest mutowany podczas obsługi eventu (np. async re-render), nigdy nie używaj `event.target.closest()` do wykrywania "click outside" — używaj `event.composedPath()`.

---

### 2. Popover niewidoczny mimo klasy `.open` (CSS display/visibility)

**Symptom**: Klasa `.open` jest dodawana do elementu, ale popover pozostaje ukryty.

**Przyczyna**: Sama właściwość `display: block` może nie wystarczyć jeśli `visibility: hidden` lub `opacity: 0` są ustawione gdzie indziej.

**Naprawa**: Kontrolować kompletny zestaw właściwości widoczności:

```css
.m365-popover {
    display: none;
    visibility: hidden;
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--transition), visibility var(--transition);
}

.m365-popover.open {
    display: block;
    visibility: visible;
    opacity: 1;
    pointer-events: auto;
}
```

**Ważne**: Nigdy nie używać `!important` — zamiast tego używać wyższej specyficzności CSS (np. `#m365AgendaPopover` zamiast `.m365-popover`).

---

### 3. Błąd parsera ICS: `E is not defined`

**Symptom**: `[m365] Failed to open agenda: "E is not defined"` w konsoli przeglądarki.

**Przyczyna**: Dosłowna literówka w `uploader/m365-calendar.js` — zbłąkany znak na końcu linii:
```javascript
// ŹLE:
const lhs = line.slice(0, idx);E
// DOBRZE:
const lhs = line.slice(0, idx);
```

**Naprawa**: Usunąć zbłąkany znak. Weryfikacja: `node --test tests/uploader/m365/*.test.js` (wszystkie 15 testów powinny przejść).

---

### 4. Wyświetlanie przeszłych lub błędnych spotkań

**Symptom A**: Widget pokazuje spotkanie z przeszłości (np. z lutego gdy jest kwiecień).

**Przyczyna**: `expandRecurringEvents()` nie filtrowała eventów wcześniejszych niż okno czasowe.

**Naprawa** (w `uploader/m365-calendar.js`):
```javascript
// Dodać warunek event.end >= windowStart:
const out = events.filter((event) => (!event.rrule || event.recurrenceId) && event.end >= windowStart);
```

**Symptom B**: `pickNextNotCanceled()` nie rozróżnia spotkań "w trakcie" od przyszłych — może pomijać aktualnie trwające.

**Naprawa**:
```javascript
function pickNextNotCanceled(events, nowMs = Date.now()) {
    // Priorytet 1: spotkanie aktualnie trwające (start <= now <= end)
    return events.find((e) => !e.isCancelled && e.start.getTime() <= nowMs && e.end.getTime() >= nowMs)
        // Priorytet 2: następne przyszłe spotkanie
        || events.find((e) => !e.isCancelled && e.start.getTime() >= nowMs)
        || null;
}
```

---

## Struktura danych ICS z Outlook

- Outlook eksportuje cykliczne spotkania jako **osobne VEVENT** dla każdej instancji (nie jako jeden event z RRULE).
- Wyjątek: niektóre eventy mogą mieć RRULE — parser musi obsługiwać oba formaty.
- `RECURRENCE-ID` wskazuje, że dany VEVENT jest konkretną instancją (np. zmienioną) serii cyklicznej.
- Strefy czasowe: Outlook używa nazw takich jak `W. Europe Standard Time` — parser mapuje je na strefy IANA.
- W przypadku podejrzenia złych dat: sprawdź mapowanie stref czasowych w parserze.

---

## Diagnostyka "złej daty" — checklist

Jeśli widget wyświetla błędną datę spotkania:

1. **Sprawdź cache serwera**: TTL = 60s. Poczekaj minutę i odśwież (hard refresh: Cmd+Shift+R).
2. **Pobierz feed ICS ręcznie**:
   ```bash
   curl -s "https://outlook.office365.com/owa/calendar/..." | grep -A 20 "SUMMARY:Nazwa Spotkania"
   ```
3. **Sprawdź DTSTART** dla poszukiwanego spotkania w surowym feedzie.
4. **Zweryfikuj mapowanie stref** — czy `W. Europe Standard Time` mapuje się poprawnie na `Europe/Warsaw`?
5. **Uruchom testy**: `node --test tests/uploader/m365/*.test.js` — powinno być 15/15.
6. **Sprawdź `expandRecurringEvents()`** — czy `windowStart` jest poprawnie ustawiony?

---

## Testy

```bash
# Uruchom wszystkie testy M365
node --test tests/uploader/m365/*.test.js

# Weryfikacja skryptem diagnostycznym
node prompts/plans/M365_CALENDAR/scripts/m365-verify.mjs
node prompts/plans/M365_CALENDAR/scripts/m365-verify-ics.mjs
```

Pliki testów:
- `tests/uploader/m365/calendar-logic.test.js` — logika filtrowania/sortowania/parsowania
- `tests/uploader/m365/server-calendar.test.js` — integracja endpointu serwera

