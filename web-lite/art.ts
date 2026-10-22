import {currentCropList,currentCropInfo} from '../src/engine/catalog.js';
/** Original vector artwork. No network assets, fonts or image downloads. */
export const cropColors: Record<string, string> = {
  radish: '#c65e69', komatsuna: '#61995a', potato: '#bb955b', corn: '#d4aa45',
  edamame: '#8ca650', sweetpotato: '#a97188', onion: '#64a086', pumpkin: '#c88a46',
  tomato: '#cf6753', watermelon: '#6c9b6b', asparagus: '#85a365', burdock: '#a28a60',
  pepper: '#5a916c', melon: '#a7b06a',
};
for(const c of currentCropList) cropColors[c.id]=c.color;
const leaf = '<path d="M49 39C20 34 21 12 24 9c22 0 31 13 29 30" fill="#527b47"/><path d="M53 37C53 13 70 7 82 11c-1 17-10 26-29 29" fill="#789b51"/><path d="M52 38C36 24 45 8 51 3c13 11 16 23 1 35" fill="#97ac60"/>';
const paths: Record<string, string> = {
  radish: `${leaf}<path d="M29 47c2-20 48-23 51 1 3 20-17 37-25 40l-2 10-4-11C39 81 25 66 29 47" fill="#f7ead4"/><path d="M29 47c3-20 47-23 51 1 1 9-3 17-8 23-12-4-24-1-35-3-6-9-9-14-8-21" fill="#cc626d"/><path d="M35 48c2-7 7-11 12-11" stroke="#edabb0" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  komatsuna: '<path d="m47 88 6-53M55 88l15-42M42 87 31 44" stroke="#e5dba5" stroke-width="8" stroke-linecap="round"/><path d="M46 62C15 72 7 43 17 27c15-13 36 8 29 35" fill="#4b865c"/><path d="M51 49C28 36 34 9 52 8c19 4 23 30-1 41" fill="#68934d"/><path d="M57 65C51 39 75 20 87 32c15 15 0 39-30 33" fill="#86a95e"/><path d="m26 38 14 17m12-32v18m25 0L63 59" stroke="#bfd18b" stroke-width="2" fill="none"/>',
  potato: '<path d="M16 57c1-16 18-37 36-33 16 1 23 19 19 34-4 16-15 30-32 27C24 82 15 71 16 57" fill="#b38c54"/><path d="M47 67c-3-17 9-35 25-34 14-2 27 15 24 30-2 21-21 31-36 23-8-4-12-10-13-19" fill="#d4b078"/><path d="m28 47 3-3m12 26 2-3m31-19 3 2m-7 23 1 3" stroke="#947141" stroke-width="3" stroke-linecap="round"/><path d="M29 32C25 18 34 9 39 11c10 5 8 15 6 18" fill="#789754"/>',
  corn: '<path d="M32 70C20 43 39 12 51 13c19-1 33 33 20 60L48 88Z" fill="#e4ba52"/><g stroke="#f7d981" stroke-width="2.5" stroke-linecap="round"><path d="m42 26 19 1m-24 9h29m-31 9h33m-32 9h32M39 64h25M47 20v52m10-52v52"/></g><path d="M48 92C16 82 10 57 15 40c26 7 26 30 33 52" fill="#68864b"/><path d="M49 92C46 65 66 49 88 41c-4 26-15 44-39 51" fill="#91a85a"/><path d="M50 88 74 57" stroke="#becb79" stroke-width="2"/>',
  edamame: '<path d="M23 69C19 53 38 24 63 17c15-4 24 4 21 18-2 14-24 39-42 45-8 3-16-1-19-11" fill="#6e944b"/><path d="M30 69C35 49 58 31 76 24" stroke="#b1c976" stroke-width="2" fill="none"/><ellipse cx="41" cy="59" rx="9" ry="11" transform="rotate(40 41 59)" fill="#9eb95f"/><ellipse cx="58" cy="43" rx="9" ry="11" transform="rotate(40 58 43)" fill="#9eb95f"/><ellipse cx="72" cy="29" rx="7" ry="8" fill="#9eb95f"/><path d="M17 85C12 68 27 48 43 43c8 16 4 32-13 43-7 5-11 5-13-1" fill="#a1b665"/>',
  sweetpotato: '<path d="M12 65C29 28 53 17 77 25l17-8-5 18C87 61 66 83 39 82L9 92l10-18Z" fill="#a3677a"/><path d="M22 67C35 45 52 36 70 34" stroke="#c78e9b" stroke-width="6" fill="none" stroke-linecap="round"/><path d="m40 67 4-6m16-10 3-5m9 19 3-6" stroke="#794a61" stroke-width="2.5" stroke-linecap="round"/>',
  onion: '<path d="m23 78 7-48 8 1-3 49m8 7L51 18l9 1-5 69m9-6 9-52 9 2-7 55" stroke="#548a65" stroke-width="10" stroke-linecap="round"/><path d="m22 69-2 20c1 8 13 8 15 0l2-18m7-10-3 28c2 10 15 10 17 0l2-25m6 8-3 17c0 8 12 10 14 2l3-18" fill="#f2e9c5"/><path d="m23 96-3 4m10-5 2 5m13-3-2 4m8-3 2 4m15-5-1 4m7-3 3 3" stroke="#c9ba85" stroke-width="1.5"/>',
  pumpkin: '<path d="M48 29c-5-13 3-22 13-23l2 9c-10 1-10 7-9 15" fill="#5c794c"/><path d="M17 41C24 24 39 26 51 30c13-8 35-4 39 16 8 24-9 46-36 46C23 94 6 71 17 41" fill="#d4984a"/><ellipse cx="39" cy="60" rx="15" ry="31" fill="#e0a956"/><ellipse cx="61" cy="60" rx="15" ry="31" fill="#e8b15c"/><path d="M53 31c-9 17-9 43 0 59M30 36c-9 14-10 34-1 48m45-46c9 12 11 30 2 44" stroke="#b37a39" stroke-width="2" fill="none"/>',
  tomato: '<path d="M15 54c-1-19 16-29 36-23 19-7 38 3 39 23 3 24-14 39-37 38C30 93 16 77 15 54" fill="#d46a51"/><path d="m52 38-22-7 14-7 7-16 7 16 18 2-14 10-3 13Z" fill="#60834c"/><path d="M24 55c-1-9 5-15 12-15" stroke="#ef9f7c" stroke-width="5" fill="none" stroke-linecap="round"/>',
  watermelon: '<ellipse cx="49" cy="49" rx="35" ry="36" fill="#71a178"/><path d="M30 20c-13 20-13 41-2 60m18-65c-8 22-8 48 0 69m17-65c13 23 14 40 3 62" stroke="#3f7254" stroke-width="5" fill="none"/><path d="M34 69h61c-3 19-13 28-30 28-16-1-26-10-31-28" fill="#397451"/><path d="M38 69h53c-4 15-13 23-26 23-12 0-22-7-27-23" fill="#f2dcaf"/><path d="M41 69h47c-4 12-11 19-23 19-10 0-18-7-24-19" fill="#d77872"/><path d="m54 75 1 3m13-4v4m11-3-1 3m-14 4v2" stroke="#685141" stroke-width="2" stroke-linecap="round"/>',
  asparagus: '<path d="m24 89 8-57m14 60 6-70m15 69 9-54" stroke="#88a264" stroke-width="12" stroke-linecap="round"/><path d="m26 38 7-27 6 28m7-11 8-25 6 27m9 14 9-25 4 28" fill="#5c8356"/><path d="m26 53 5 4 5-3m11-14 6 5 5-3m12 14 5 5 5-3m-51 9 5 5 5-4m9-12 5 4 6-3m9 14 6 4 5-2" stroke="#c2cc8d" stroke-width="2" fill="none"/>',
  burdock: '<path d="m30 84 28-60c4-7 13-5 10 4L43 91c-3 8-18 1-13-7" fill="#aa875d"/><path d="m51 89 22-47c3-6 12-3 9 4L65 94c-4 9-18 3-14-5" fill="#c4a476"/><path d="m41 64 8 4m-1-18 6 3m4-17 5 3m-32 42 7 3m24-15 7 3m0-17 6 3" stroke="#866645" stroke-width="2"/><path d="M57 23C39 17 43 3 47 2c15 2 21 11 17 20m1 0C65 5 81 1 87 6c-3 12-11 16-22 16" fill="#729151"/>',
  pepper: '<path d="M48 29c1-12 6-18 15-18l1 8c-10 1-9 7-10 13" fill="#53724a"/><path d="M22 40c9-16 24-10 31-7 11-7 25-4 30 8 7 20-2 47-16 49l-14-5c-17 12-29 0-32-13-5-13-5-24 1-32" fill="#66966b"/><path d="M51 37c-10 16-8 36 2 48" stroke="#387854" stroke-width="3" fill="none"/><path d="M30 42c-5 7-5 16-3 20" stroke="#a1bb7b" stroke-width="5" fill="none" stroke-linecap="round"/>',
  melon: '<circle cx="52" cy="58" r="34" fill="#b1b56b"/><g stroke="#d9d6a1" stroke-width="1.8" fill="none"><path d="m24 40 48 43M19 55l32 34M38 28l45 40M25 77l49-42M20 64l41-38M41 90l44-41"/><ellipse cx="52" cy="58" rx="18" ry="34"/></g><path d="M51 25V12m-16-1 30 2" stroke="#688253" stroke-width="6" stroke-linecap="round"/>',
};

paths.lettuce='<path d="M25 81C5 63 12 45 24 45 8 23 31 13 41 27 43 4 67 8 67 26c20-17 37 4 23 20 18 16-4 47-27 45H39Z" fill="#92b275"/><path d="M38 85C16 63 30 48 43 54c-14-24 15-37 24-14 20-8 28 15 9 31l-17 20" fill="#6e9a62"/><path d="M52 91V45m0 32L34 61m18 20 20-22" stroke="#ced6a0" stroke-width="3" fill="none"/>';
paths.carrot='<path d="M30 39c8-12 29-9 32 3L44 94c-2 5-7 4-8-1Z" fill="#d68b49"/><path d="m60 53 15-8c9 12 5 36-17 51-4 2-6 0-5-4Z" fill="#e1a05d"/><path d="m35 56 11 2m-8 12 6 1m18 2 8 3" stroke="#b7733c" stroke-width="2"/><path d="M44 36C18 25 26 7 35 13l11 16C39 5 58 1 58 12l-8 22c13-23 28-16 21-7L51 39" fill="#6d9656"/>';
paths.okra='<path d="m25 88 9-59 14-10 9 17-24 56Z" fill="#7c9c51"/><path d="m48 91 13-50 14-12 7 16-26 50Z" fill="#a0b66a"/><path d="m30 87 13-54m11 57 16-45" stroke="#c7cf8c" stroke-width="2"/><path d="m32 32 3-13 11-4 7 10m8 19 2-12 11-8 8 10" fill="#527a48"/>';
paths.eggplant='<path d="M44 31C18 31 11 54 20 73c10 24 41 23 53 2 8-17 0-37-16-41Z" fill="#847099"/><path d="M30 43c-10 10-9 21-3 30" fill="none" stroke="#b49ab7" stroke-width="5" stroke-linecap="round"/><path d="m44 39-13-8 13-8 8-14 7 15 14 7-14 10-7-8Z" fill="#608253"/><path d="M52 24q-3-15 9-18" fill="none" stroke="#608253" stroke-width="5"/>';

export function vegetable(id: string, className = '', label = ''): string {
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  return `<svg class="veg ${className}" viewBox="0 0 104 104" ${a11y}><ellipse cx="52" cy="94" rx="29" ry="5" fill="#493d2510"/>${paths[currentCropInfo.get(id)?.art??id] ?? paths.radish}</svg>`;
}

export function icon(kind: string): string {
  const content: Record<string, string> = {
    leaf: '<path d="M5 18C2 8 10 3 21 3c1 12-4 19-14 16m-2 3L17 9"/>',
    coin: '<circle cx="12" cy="12" r="9"/><path d="M15 8c-6-3-9 3-3 4s3 7-3 4m3-10v12"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
    sound: '<path d="m4 9 5 0 5-5v16l-5-5H4Zm13-2c4 3 4 7 0 10m3-13c6 5 6 11 0 16"/>',
    mute: '<path d="m4 9 5 0 5-5v16l-5-5H4Zm14 0 5 6m0-6-5 6"/>',
    gear: '<path d="m9 3-1 3-3 1-1 3 2 2-1 3 3 2 1 3h5l1-3 3-1 2-3-2-2 1-3-3-2-1-3Z"/><circle cx="12" cy="12" r="3"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    play: '<path d="m7 4 14 8-14 8Z"/>',
    book: '<path d="M3 4c4-1 7 0 9 2 3-2 6-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2Zm9 2v15"/>',
    fast: '<path d="m3 5 9 7-9 7Zm10 0 9 7-9 7Z"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    rotate: '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="m2 7 1-4 4 1m13 13-1 4-4-1"/>',
    trophy: '<path d="M7 3h10v7c0 6-10 6-10 0Zm0 2H3v3c0 4 3 5 5 4m9-7h4v3c0 4-3 5-5 4m-4 3v6m-5 0h10"/>',
  };
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${content[kind] ?? content.leaf}</svg>`;
}

export function avatar(seat: number, character?: string): string {
  const shirts = ['#527b69', '#bd765c', '#7a89a8', '#b29056', '#997c9c'];
  if(character && ['grower','weather','planner','steady'].includes(character)){
    const hair=character==='grower'?'#c59c53':'#514737';
    const head=character==='weather'
      ? '<circle cx="35" cy="21" r="7" fill="#514737"/><path d="M12 19Q10 2 25 4Q40 4 38 20L28 12Z" fill="#b96658"/><path d="m33 15 10 5-8 4" fill="#b96658"/><path d="M15 10q9-6 18 2" fill="none" stroke="#e4b29a" stroke-width="2"/>'
      : character==='steady'
      ? '<path d="M12 23Q9 5 24 5Q40 5 37 28l-7-14-14 7Z" fill="#514737"/><ellipse cx="24" cy="13" rx="17" ry="4" fill="#e8d3a3"/><path d="M14 12Q14-1 32 6l3 6" fill="#f0e2bb"/><path d="M15 10h19v3H15" fill="#73917b"/>'
      : `<ellipse cx="24" cy="14" rx="20" ry="4" fill="#d9b873"/><path d="M12 13Q13-1 28 2q9 2 8 11" fill="#ead49c"/><path d="M13 10h22v4H13" fill="${character==='planner'?'#657f57':'#8394a7'}"/>`;
    const detail=character==='planner'
      ? '<g fill="none" stroke="#665a43" stroke-width="1.3"><circle cx="19" cy="24" r="4"/><circle cx="29" cy="24" r="4"/><path d="M23 24h2m-10-1-3-1m21 1 3-1"/></g>'
      : character==='grower'?'<path d="M18 29q3-4 6-1 3-3 6 1l-6 2Z" fill="#b78b44"/>'
      : character==='weather'?'<circle cx="16" cy="28" r="2" fill="#d99579" opacity=".5"/><circle cx="32" cy="28" r="2" fill="#d99579" opacity=".5"/>'
      : '<path d="M18 38h13l4 10H13Z" fill="#dce1bf"/><path d="m25 42 4-4q3 4-4 6m0-2-3-3q-3 3 3 5" fill="#6e8d59"/>';
    return `<svg viewBox="0 0 48 48" class="avatar" aria-hidden="true"><circle cx="24" cy="24" r="23" fill="${shirts[seat]}22"/><path d="M8 48c1-19 31-19 32 0" fill="${shirts[seat]}"/><path d="M19 30v8q5 5 10-1v-7" fill="#d6a77d"/><ellipse cx="24" cy="23" rx="11" ry="13" fill="#edc69b"/><path d="M13 22Q9 5 25 8q14-1 12 17L29 14l-8 4-8 7" fill="${hair}"/>${head}<circle cx="19" cy="24" r="1" fill="#584b37"/><circle cx="29" cy="24" r="1" fill="#584b37"/><path d="M21 31q3 2 6-1" fill="none" stroke="#a66d51" stroke-linecap="round"/>${detail}</svg>`;
  }
  return `<svg viewBox="0 0 48 48" class="avatar" aria-hidden="true"><circle cx="24" cy="24" r="23" fill="${shirts[seat]}22"/><path d="M9 47c1-18 29-18 30 0" fill="${shirts[seat]}"/><path d="M18 32v6c4 4 9 3 12-1v-7" fill="#d6a77d"/><ellipse cx="24" cy="23" rx="11" ry="13" fill="#edc69b"/><path d="M13 22c-4-15 22-19 24-3l-8-5-16 9" fill="#5c5140"/><ellipse cx="24" cy="16" rx="20" ry="4" fill="#dfbf77"/><path d="M12 15c1-16 23-16 24 0" fill="#e9d29a"/><path d="M12 12h24v4H12" fill="${shirts[seat]}"/><circle cx="20" cy="24" r="1" fill="#584b37"/><circle cx="29" cy="24" r="1" fill="#584b37"/><path d="M21 30q3 2 6-1" fill="none" stroke="#a66d51" stroke-linecap="round"/></svg>`;
}

export function countryside(): string {
  return `<svg class="countryside" viewBox="0 0 1200 720" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#dce8da"/><stop offset="1" stop-color="#f4e9c8"/></linearGradient><linearGradient id="land" x2="0" y2="1"><stop stop-color="#b9c493"/><stop offset="1" stop-color="#e0b77e"/></linearGradient><pattern id="rows" width="70" height="70" patternUnits="userSpaceOnUse" patternTransform="rotate(-25)"><path d="M0 0v70" stroke="#a88b54" stroke-width="8" opacity=".2"/></pattern></defs><path fill="url(#sky)" d="M0 0h1200v720H0Z"/><circle cx="820" cy="135" r="58" fill="#f5dfa0"/><g fill="#fbf6e8" opacity=".75"><path d="M122 155c-25-36 24-65 49-38 22-53 87-22 77 11 35-8 46 29 20 36H122Z"/><path d="M850 105c-16-26 17-39 35-22 12-38 57-25 58 3 23-10 47 19 28 31H850Z"/></g><path d="M0 362C200 190 339 280 505 325S850 204 1200 309v411H0" fill="#89a286"/><path d="M0 421c214-156 383-67 528-84 263-25 457-81 672 56v327H0" fill="#b4c294"/><path d="M0 471C278 341 481 464 674 375c179-82 382 49 526 70v275H0Z" fill="url(#land)"/><path d="M0 471C278 341 481 464 674 375c179-82 382 49 526 70v275H0Z" fill="url(#rows)"/><path d="M770 349c-40 62-85 70-112 108-48 65-111 100-254 263h130c108-130 151-174 179-236 34-72 46-84 91-126" fill="#f1dfb4"/><g transform="translate(310 320)"><path d="M0 0h94v74H0Z" fill="#eee4c9"/><path d="m-12 2 59-43 61 43" fill="#aa7159"/><path d="M36 35h25v39H36" fill="#8a7151"/><path d="M10 17h16v18H10m59-18h16v18H69" fill="#8da89a"/></g><g fill="#527961"><path d="M80 418v-75h5v75Z"/><ellipse cx="83" cy="331" rx="32" ry="45"/><path d="M181 390v-82h6v82Z"/><ellipse cx="184" cy="293" rx="40" ry="47"/><path d="M1037 450v-95h6v95Z"/><ellipse cx="1040" cy="333" rx="43" ry="55"/></g><g fill="#7a965e" opacity=".65"><path d="M100 550q-35-40-40-9 13 21 40 9m0 0q17-54 37-31 1 26-37 31m94 58q-35-40-40-9 13 21 40 9m0 0q17-54 37-31 1 26-37 31m94 61q-35-40-40-9 13 21 40 9m0 0q17-54 37-31 1 26-37 31"/></g><g stroke="#f3e2ba" stroke-width="5"><path d="m864 535 225 38m-205-62-4 60m54-51-4 60m54-51-4 60m54-51-4 60"/></g></svg>`;
}
