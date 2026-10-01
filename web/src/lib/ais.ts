// AIS code tables (ITU-R M.1371) and MMSI → flag lookup.

export interface ShipCategory {
  key: string;
  label: string;
  color: string;
}

export const CATEGORIES = {
  cargo: { key: "cargo", label: "Cargo", color: "#22c55e" },
  tanker: { key: "tanker", label: "Tanker", color: "#ef4444" },
  passenger: { key: "passenger", label: "Passenger", color: "#3b82f6" },
  fishing: { key: "fishing", label: "Fishing", color: "#f97316" },
  service: { key: "service", label: "Tug & Service", color: "#06b6d4" },
  pleasure: { key: "pleasure", label: "Pleasure & Sail", color: "#d946ef" },
  highspeed: { key: "highspeed", label: "High-speed", color: "#eab308" },
  military: { key: "military", label: "Military & Law", color: "#94a3b8" },
  other: { key: "other", label: "Other", color: "#a78bfa" },
  unknown: { key: "unknown", label: "Unknown", color: "#64748b" },
} satisfies Record<string, ShipCategory>;

export type CategoryKey = keyof typeof CATEGORIES;

export function shipCategory(type?: number): ShipCategory {
  if (!type) return CATEGORIES.unknown;
  if (type >= 70 && type <= 79) return CATEGORIES.cargo;
  if (type >= 80 && type <= 89) return CATEGORIES.tanker;
  if (type >= 60 && type <= 69) return CATEGORIES.passenger;
  if (type === 30) return CATEGORIES.fishing;
  if ([31, 32, 33, 34, 50, 51, 52, 53, 54, 58].includes(type)) return CATEGORIES.service;
  if (type === 36 || type === 37) return CATEGORIES.pleasure;
  if ((type >= 40 && type <= 49) || (type >= 20 && type <= 29)) return CATEGORIES.highspeed;
  if (type === 35 || type === 55) return CATEGORIES.military;
  return CATEGORIES.other;
}

const TYPE_LABELS: Record<number, string> = {
  30: "Fishing", 31: "Towing", 32: "Towing (large)", 33: "Dredging", 34: "Diving ops",
  35: "Military ops", 36: "Sailing", 37: "Pleasure craft", 50: "Pilot vessel", 51: "Search & rescue",
  52: "Tug", 53: "Port tender", 54: "Anti-pollution", 55: "Law enforcement", 58: "Medical transport",
  59: "Noncombatant",
};

export function shipTypeLabel(type?: number): string {
  if (!type) return "Unknown";
  if (TYPE_LABELS[type]) return TYPE_LABELS[type];
  const decade = Math.floor(type / 10);
  const base = { 2: "Wing in ground", 4: "High-speed craft", 6: "Passenger", 7: "Cargo", 8: "Tanker", 9: "Other" }[decade];
  if (!base) return `Type ${type}`;
  const hazard = { 1: " · Haz A", 2: " · Haz B", 3: " · Haz C", 4: " · Haz D" }[type % 10] ?? "";
  return base + hazard;
}

export const NAV_STATUS: Record<number, { label: string; tone: "move" | "stop" | "warn" | "neutral" }> = {
  0: { label: "Under way", tone: "move" },
  1: { label: "At anchor", tone: "stop" },
  2: { label: "Not under command", tone: "warn" },
  3: { label: "Restricted manoeuvrability", tone: "warn" },
  4: { label: "Constrained by draught", tone: "warn" },
  5: { label: "Moored", tone: "stop" },
  6: { label: "Aground", tone: "warn" },
  7: { label: "Fishing", tone: "move" },
  8: { label: "Under way sailing", tone: "move" },
  11: { label: "Towing astern", tone: "move" },
  12: { label: "Pushing ahead", tone: "move" },
  14: { label: "AIS-SART active", tone: "warn" },
};

export const navStatusInfo = (s?: number) => (s === undefined ? undefined : NAV_STATUS[s]);

// Maritime Identification Digits → ISO 3166 alpha-2
const MID_TABLE =
  "201AL 202AD 203AT 204PT 205BE 206BY 207BG 208VA 209CY 210CY 211DE 212CY 213GE 214MD 215MT 216AM 218DE 219DK " +
  "220DK 224ES 225ES 226FR 227FR 228FR 229MT 230FI 231FO 232GB 233GB 234GB 235GB 236GI 237GR 238HR 239GR 240GR " +
  "241GR 242MA 243HU 244NL 245NL 246NL 247IT 248MT 249MT 250IE 251IS 252LI 253LU 254MC 255PT 256MT 257NO 258NO " +
  "259NO 261PL 262ME 263PT 264RO 265SE 266SE 267SK 268SM 269CH 270CZ 271TR 272UA 273RU 274MK 275LV 276EE 277LT " +
  "278SI 279RS 301AI 303US 304AG 305AG 306CW 307AW 308BS 309BS 310BM 311BS 312BZ 314BB 316CA 319KY 321CR 323CU " +
  "325DM 327DO 329GP 330GD 331GL 332GT 334HN 336HT 338US 339JM 341KN 343LC 345MX 347MQ 348MS 350NI 351PA 352PA " +
  "353PA 354PA 355PA 356PA 357PA 358PR 359SV 361PM 362TT 364TC 366US 367US 368US 369US 370PA 371PA 372PA 373PA " +
  "374PA 375VC 376VC 377VC 378VG 379VI 401AF 403SA 405BD 408BH 410BT 412CN 413CN 414CN 416TW 417LK 419IN 422IR " +
  "423AZ 425IQ 428IL 431JP 432JP 434TM 436KZ 437UZ 438JO 440KR 441KR 443PS 445KP 447KW 450LB 451KG 453MO 455MV " +
  "457MN 459NP 461OM 463PK 466QA 468SY 470AE 471AE 472TJ 473YE 475YE 477HK 478BA 501TF 503AU 506MM 508BN 510FM " +
  "511PW 512NZ 514KH 515KH 516CX 518CK 520FJ 523CC 525ID 529KI 531LA 533MY 536MP 538MH 540NC 542NU 544NR 546PF " +
  "548PH 550TL 553PG 555PN 557SB 559AS 561WS 563SG 564SG 565SG 566SG 567TH 570TO 572TV 574VN 576VU 577VU 578WF " +
  "601ZA 603AO 605DZ 607TF 608SH 609BI 610BJ 611BW 612CF 613CM 615CG 616KM 617CV 618TF 619CI 620KM 621DJ 622EG " +
  "624ET 625ER 626GA 627GH 629GM 630GW 631GQ 632GN 633BF 634KE 635TF 636LR 637LR 638SS 642LY 644LS 645MU 647MG " +
  "649ML 650MZ 654MR 655MW 656NE 657NG 659NA 660RE 661RW 662SD 663SN 664SC 665SH 666SO 667SL 668ST 669SZ 670TD " +
  "671TG 672TN 674TZ 675UG 676CD 677TZ 678ZM 679ZW 701AR 710BR 720BO 725CL 730CO 735EC 740FK 745GF 750GY 755PY " +
  "760PE 765SR 770UY 775VE";

const MID = new Map(MID_TABLE.split(" ").map((e) => [Number(e.slice(0, 3)), e.slice(3)]));
const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

export interface Flag {
  code: string;
  name: string;
}

export function flagFromMmsi(mmsi: number): Flag | undefined {
  const s = String(mmsi).padStart(9, "0");
  let mid: number;
  if (/^[2-7]/.test(s)) mid = Number(s.slice(0, 3));
  else if (/^(98|99)/.test(s)) mid = Number(s.slice(2, 5));
  else if (/^00/.test(s)) mid = Number(s.slice(2, 5));
  else if (/^0/.test(s)) mid = Number(s.slice(1, 4));
  else return undefined;
  const code = MID.get(mid);
  if (!code) return undefined;
  let name = code;
  try {
    name = regionNames.of(code) ?? code;
  } catch {
    /* unknown region code */
  }
  return { code, name };
}

/** Free flag images (flagcdn.com) — emoji flags don't render on Windows. */
export const flagUrl = (code: string) => `https://flagcdn.com/w40/${code.toLowerCase()}.png`;

export const vesselLink = (mmsi: number) => `https://www.marinetraffic.com/en/ais/details/ships/mmsi:${mmsi}`;
