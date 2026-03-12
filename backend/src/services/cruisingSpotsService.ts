import fs from "node:fs";
import path from "node:path";

import { containsDisallowedKidVariation } from "./contentPolicy";

export type ErrorCode = "ANONYMOUS_FORBIDDEN" | "AGE_GATE_REQUIRED" | "INVALID_INPUT" | "SPOT_NOT_FOUND";

export type ServiceError = Readonly<{
  code: ErrorCode;
  message: string;
  context?: Record<string, unknown>;
}>;

type ResultOk<T> = Readonly<{ ok: true; value: T }>;
type ResultErr = Readonly<{ ok: false; error: ServiceError }>;
export type Result<T> = ResultOk<T> | ResultErr;

export type SessionLike = Readonly<{
  userType: "guest" | "registered" | "subscriber";
  userId?: string;
  sessionToken?: string;
  ageVerified: boolean;
  role?: "user" | "admin";
}>;

export type ModerationStatus = "pending" | "approved" | "rejected";

export type CruisingSpot = Readonly<{
  spotId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  description: string;
  photoMediaId?: string;
  creatorUserId: string;
  createdAtMs: number;
  checkInCount: number;
  actionCount: number;
  moderationStatus: ModerationStatus;
  moderatedAtMs?: number;
  moderatedByUserId?: string;
  moderationReason?: string;
}>;

export type SpotCheckIn = Readonly<{
  spotId: string;
  actorKey: string;
  checkedInAtMs: number;
}>;

export type CruisingSpotsState = Readonly<{
  spots: ReadonlyArray<CruisingSpot>;
  checkIns: ReadonlyArray<Readonly<{ spotId: string; rows: ReadonlyArray<SpotCheckIn> }>>;
  actions: ReadonlyArray<Readonly<{ spotId: string; rows: ReadonlyArray<{ spotId: string; actorKey: string; markedAtMs: number }> }>>;
}>;

const PERMANENT_CRUISING_SPOTS: ReadonlyArray<CruisingSpot> = [
  {
    spotId: "spot_van_pumpjack_pub",
    name: "PumpJack Pub",
    address: "1167 Davie St",
    lat: 49.2814951,
    lng: -123.132742,
    description: "Permanent cruising spot with a shared message board. Categories: Bars, Clubs.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:00.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved",
    moderatedAtMs: Date.parse("2026-03-12T00:00:00.000Z"),
    moderatedByUserId: "system:seed"
  },
  {
    spotId: "spot_van_fantasy_factory_davie",
    name: "Fantasy Factory - Davie St",
    address: "1155 Davie Street",
    lat: 49.2813093,
    lng: -123.132428,
    description: "Permanent cruising spot with a shared message board. Categories: Bars, Clubs.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:01.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved",
    moderatedAtMs: Date.parse("2026-03-12T00:00:01.000Z"),
    moderatedByUserId: "system:seed"
  },
  {
    spotId: "spot_van_aids_memorial",
    name: "Vancouver AIDS Memorial",
    address: "Beach Ave & Nicola St.",
    lat: 49.2820175,
    lng: -123.1396467,
    description: "Permanent cruising spot with a shared message board. Category: Cruising Areas.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:02.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved",
    moderatedAtMs: Date.parse("2026-03-12T00:00:02.000Z"),
    moderatedByUserId: "system:seed"
  },
  {
    spotId: "spot_van_english_bay_bathroom",
    name: "English Bay Bathroom",
    address: "1790 Beach Ave",
    lat: 49.2866865,
    lng: -123.1427459,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:03.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved",
    moderatedAtMs: Date.parse("2026-03-12T00:00:03.000Z"),
    moderatedByUserId: "system:seed"
  },
  {
    spotId: "spot_van_sandman_suites_hotel",
    name: "Sandman Suites Hotel",
    address: "1160 Davie St",
    lat: 49.2810379,
    lng: -123.132738,
    description: "Permanent cruising spot with a shared message board. Categories: Hotels, Resorts, Campgrounds.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:04.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved",
    moderatedAtMs: Date.parse("2026-03-12T00:00:04.000Z"),
    moderatedByUserId: "system:seed"
  },
  {
    spotId: "spot_van_sunset_beach_concession",
    name: "Sunset Beach Concession",
    address: "1204 Beach Ave, Vancouver, BC V6E 1V3",
    lat: 49.2787413,
    lng: -123.1378388,
    description: "Permanent cruising spot with a shared message board. Category: Cruising Areas.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:05.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved",
    moderatedAtMs: Date.parse("2026-03-12T00:00:05.000Z"),
    moderatedByUserId: "system:seed"
  },
  {
    spotId: "spot_van_f212_steam",
    name: "F212 Steam",
    address: "1048 Davie Street",
    lat: 49.2797986,
    lng: -123.130533,
    description: "Permanent cruising spot with a shared message board. Categories: Bathhouses, Saunas.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:06.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved",
    moderatedAtMs: Date.parse("2026-03-12T00:00:06.000Z"),
    moderatedByUserId: "system:seed"
  },
  {
    spotId: "spot_van_1281_west_georgia_office",
    name: "1281 West Georgia St. Office",
    address: "1281 West Georgia",
    lat: 49.2882184,
    lng: -123.126509,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:07.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved",
    moderatedAtMs: Date.parse("2026-03-12T00:00:07.000Z"),
    moderatedByUserId: "system:seed"
  },
  {
    spotId: "spot_van_1188_west_georgia_floors_10_13",
    name: "1188 West Georgia Street, Floors 10, 11, 12, 13",
    address: "1188 West Georgia Street",
    lat: 49.2866929,
    lng: -123.125311,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:08.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved",
    moderatedAtMs: Date.parse("2026-03-12T00:00:08.000Z"),
    moderatedByUserId: "system:seed"
  },
  {
    spotId: "spot_van_robert_lee_ymca",
    name: "Robert Lee YMCA",
    address: "955 Burrard St",
    lat: 49.2818468,
    lng: -123.125464,
    description: "Permanent cruising spot with a shared message board. Category: Gyms.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:09.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved",
    moderatedAtMs: Date.parse("2026-03-12T00:00:09.000Z"),
    moderatedByUserId: "system:seed"
  },
  {
    spotId: "spot_van_vancouver_aquatic_centre",
    name: "Vancouver Aquatic Centre",
    address: "1050 Beach Ave",
    lat: 49.2769573,
    lng: -123.1355483,
    description: "Permanent cruising spot with a shared message board.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:10.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved",
    moderatedAtMs: Date.parse("2026-03-12T00:00:10.000Z"),
    moderatedByUserId: "system:seed"
  },
  {
    spotId: "spot_van_sheraton_wall_centre",
    name: "Hotel Sheraton Vancouver Wall Centre",
    address: "1088 Burrard St.",
    lat: 49.2804051,
    lng: -123.1261261,
    description: "Permanent cruising spot with a shared message board. Categories: Hotels, Resorts, Campgrounds.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:11.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved",
    moderatedAtMs: Date.parse("2026-03-12T00:00:11.000Z"),
    moderatedByUserId: "system:seed"
  },
  {
    spotId: "spot_van_fitness_world_georgia_bute",
    name: "Fitness World Georgia & Bute",
    address: "1185 W Georgia St",
    lat: 49.2871521,
    lng: -123.1247231,
    description: "Permanent cruising spot with a shared message board.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:12.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved",
    moderatedAtMs: Date.parse("2026-03-12T00:00:12.000Z"),
    moderatedByUserId: "system:seed"
  },
  {
    spotId: "spot_van_royal_centre",
    name: "Royal Centre",
    address: "1055 W Georgia St",
    lat: 49.2853,
    lng: -123.1215835,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:13.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved",
    moderatedAtMs: Date.parse("2026-03-12T00:00:13.000Z"),
    moderatedByUserId: "system:seed"
  },
  {
    spotId: "spot_van_sutton_place_hotel",
    name: "Sutton Place Hotel",
    address: "845 Burrard St",
    lat: 49.282958,
    lng: -123.124276,
    description: "Permanent cruising spot with a shared message board. Categories: Hotels, Resorts, Campground.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:14.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved",
    moderatedAtMs: Date.parse("2026-03-12T00:00:14.000Z"),
    moderatedByUserId: "system:seed"
  },
  {
    spotId: "spot_van_equinox_west_georgia",
    name: "Equinox West Georgia Street",
    address: "1131 W Georgia St",
    lat: 49.2862881,
    lng: -123.123574,
    description: "Permanent cruising spot with a shared message board. Category: Gyms.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:15.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved",
    moderatedAtMs: Date.parse("2026-03-12T00:00:15.000Z"),
    moderatedByUserId: "system:seed"
  },
  {
    spotId: "spot_van_1090_west_georgia_floor_13_washroom",
    name: "1090 West Georgia - Floor 13 Washroom",
    address: "1090 W Georgia St",
    lat: 49.2853311,
    lng: -123.123193,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:16.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved",
    moderatedAtMs: Date.parse("2026-03-12T00:00:16.000Z"),
    moderatedByUserId: "system:seed"
  },
  {
    spotId: "spot_van_fitness_world_howe",
    name: "Fitness World - Howe Street",
    address: "1214 Howe Street",
    lat: 49.2775094,
    lng: -123.127376,
    description: "Permanent cruising spot with a shared message board. Category: Gyms.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:17.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved",
    moderatedAtMs: Date.parse("2026-03-12T00:00:17.000Z"),
    moderatedByUserId: "system:seed"
  },
  {
    spotId: "spot_van_stanley_park_lost_lagoon_washroom",
    name: "Stanley Park Public Washroom Lost lagoon",
    address: "710 Chilco St",
    lat: 49.2934677,
    lng: -123.1378946,
    description: "Permanent cruising spot with a shared message board.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:18.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved",
    moderatedAtMs: Date.parse("2026-03-12T00:00:18.000Z"),
    moderatedByUserId: "system:seed"
  },
  {
    spotId: "spot_van_burrard_building_1030_w_georgia",
    name: "The Burrard Building - 1030 West Georgia St.",
    address: "1030 W Georgia St.",
    lat: 49.2845614,
    lng: -123.1220078,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:19.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved",
    moderatedAtMs: Date.parse("2026-03-12T00:00:19.000Z"),
    moderatedByUserId: "system:seed"
  },
  {
    spotId: "spot_van_fairmont_hotel_vancouver",
    name: "Fairmont Hotel Vancouver",
    address: "900 W Georgia St. Vancouver, BC",
    lat: 49.2837697,
    lng: -123.1209858,
    description: "Permanent cruising spot with a shared message board. Categories: Hotels, Resorts, Campgrounds.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:20.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved",
    moderatedAtMs: Date.parse("2026-03-12T00:00:20.000Z"),
    moderatedByUserId: "system:seed"
  },
  {
    spotId: "spot_van_four_bentall_centre",
    name: "Four Bentall Centre",
    address: "1055 Dunsmuir St",
    lat: 49.2864858,
    lng: -123.1212975,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:21.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved",
    moderatedAtMs: Date.parse("2026-03-12T00:00:21.000Z"),
    moderatedByUserId: "system:seed"
  },
  {
    spotId: "spot_van_fantasy_factory_granville",
    name: "Fantasy Factory - Granville Street",
    address: "1097 Granville Street",
    lat: 49.278381,
    lng: -123.124628,
    description: "Permanent cruising spot with a shared message board. Categories: Theatres, Bookstores, Sex Shops.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:22.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved",
    moderatedAtMs: Date.parse("2026-03-12T00:00:22.000Z"),
    moderatedByUserId: "system:seed"
  },
  {
    spotId: "spot_van_stanley_park_brewpub_bathroom",
    name: "Stanley Park Brew Pub, Men's outdoor access bathroom",
    address: "8901 Stanley Park Dr",
    lat: 49.2923005,
    lng: -123.1464482,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:23.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved",
    moderatedAtMs: Date.parse("2026-03-12T00:00:23.000Z"),
    moderatedByUserId: "system:seed"
  },
  {
    spotId: "spot_van_hyatt_regency_hotel",
    name: "Hyatt Regency Hotel",
    address: "655 Burrard Street",
    lat: 49.2851852,
    lng: -123.120638,
    description: "Permanent cruising spot with a shared message board. Categories: Hotels, Resorts, Campgrounds.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:24.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved",
    moderatedAtMs: Date.parse("2026-03-12T00:00:24.000Z"),
    moderatedByUserId: "system:seed"
  },
  {
    spotId: "spot_van_house_concepts_gym",
    name: "House Concepts Gym",
    address: "1431 Continental St #701",
    lat: 49.2747629,
    lng: -123.130794,
    description: "Permanent cruising spot with a shared message board. Category: Gyms.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:25.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved",
    moderatedAtMs: Date.parse("2026-03-12T00:00:25.000Z"),
    moderatedByUserId: "system:seed"
  },
  {
    spotId: "spot_van_one_bentall_centre",
    name: "One Bentall Centre",
    address: "505 Burrard St",
    lat: 49.2866021,
    lng: -123.1185323,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:26.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved",
    moderatedAtMs: Date.parse("2026-03-12T00:00:26.000Z"),
    moderatedByUserId: "system:seed"
  },
  {
    spotId: "spot_van_marriott_pinnacle_hotel",
    name: "Marriott Pinnacle Hotel",
    address: "1128 West Hastings Street",
    lat: 49.2879554,
    lng: -123.1211474,
    description: "Permanent cruising spot with a shared message board. Category: Gyms.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:27.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved",
    moderatedAtMs: Date.parse("2026-03-12T00:00:27.000Z"),
    moderatedByUserId: "system:seed"
  },
  {
    spotId: "spot_van_three_bentall_centre_4f",
    name: "Three Bentall Centre, 4th Floor.",
    address: "595 Burrard St.",
    lat: 49.2861912,
    lng: -123.1199006,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:28.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved",
    moderatedAtMs: Date.parse("2026-03-12T00:00:28.000Z"),
    moderatedByUserId: "system:seed"
  },
  {
    spotId: "spot_van_1050_west_pender",
    name: "1050 West Pender",
    address: "1050 Pender Street West, Vancouver, BC",
    lat: 49.2866939,
    lng: -123.1192135,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:29.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved",
    moderatedAtMs: Date.parse("2026-03-12T00:00:29.000Z"),
    moderatedByUserId: "system:seed"
  },
  {
    spotId: "spot_van_rosewood_hotel_georgia",
    name: "Rosewood Hotel Georgia",
    address: "801 West Georgia Street",
    lat: 49.2835462,
    lng: -123.1190442,
    description: "Permanent cruising spot with a shared message board. Categories: Hotels, Resorts, Campgrounds.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:30.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved",
    moderatedAtMs: Date.parse("2026-03-12T00:00:30.000Z"),
    moderatedByUserId: "system:seed"
  },
  {
    spotId: "spot_van_scotia_tower_650_w_georgia",
    name: "Scotia Tower - 650 West Georgia",
    address: "650 West Georgia Street",
    lat: 49.2819065,
    lng: -123.117695,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:31.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved",
    moderatedAtMs: Date.parse("2026-03-12T00:00:31.000Z"),
    moderatedByUserId: "system:seed"
  },
  {
    spotId: "spot_van_jack_poole_plaza",
    name: "Jack Poole Plaza",
    address: "1055 Canada Place",
    lat: 49.2894777,
    lng: -123.1174001,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:32.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved",
    moderatedAtMs: Date.parse("2026-03-12T00:00:32.000Z"),
    moderatedByUserId: "system:seed"
  },
  {
    spotId: "spot_van_david_lam_park_washroom",
    name: "David Lam Park Washroom",
    address: "1300 Pacific Boulevard",
    lat: 49.2719754,
    lng: -123.1246619,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:33.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved",
    moderatedAtMs: Date.parse("2026-03-12T00:00:33.000Z"),
    moderatedByUserId: "system:seed"
  },
  {
    spotId: "spot_van_pan_pacific_top_floor_washroom",
    name: "Pan Pacific Hotel Vancouver - washroom top floor",
    address: "999 Canada Place",
    lat: 49.2878972,
    lng: -123.113048,
    description: "Permanent cruising spot with a shared message board. Categories: Hotels, Resorts, Campgrounds.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:34.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved",
    moderatedAtMs: Date.parse("2026-03-12T00:00:34.000Z"),
    moderatedByUserId: "system:seed"
  },
  {
    spotId: "spot_van_sinclair_centre",
    name: "Sinclair Centre",
    address: "757 West Hastings Street",
    lat: 49.2858905,
    lng: -123.1138846,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:35.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved",
    moderatedAtMs: Date.parse("2026-03-12T00:00:35.000Z"),
    moderatedByUserId: "system:seed"
  },
  {
    spotId: "spot_van_the_post_first_floor_bathroom",
    name: "The Post - First Floor Bathroom",
    address: "658 Homer Street",
    lat: 49.2808948,
    lng: -123.1137889,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:36.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved",
    moderatedAtMs: Date.parse("2026-03-12T00:00:36.000Z"),
    moderatedByUserId: "system:seed"
  },
  {
    spotId: "spot_van_harbour_centre_food_court",
    name: "Harbour Centre Food Court",
    address: "555 West Hastings Street",
    lat: 49.2846668,
    lng: -123.1119122,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:37.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved",
    moderatedAtMs: Date.parse("2026-03-12T00:00:37.000Z"),
    moderatedByUserId: "system:seed"
  },
  {
    spotId: "spot_van_vancouver_aquarium",
    name: "Vancouver Aquarium",
    address: "845 Avison Way",
    lat: 49.3004519,
    lng: -123.1312705,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:38.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved",
    moderatedAtMs: Date.parse("2026-03-12T00:00:38.000Z"),
    moderatedByUserId: "system:seed"
  },
  {
    spotId: "spot_van_false_creek_community_centre",
    name: "False Creek Community Centre",
    address: "1318 Cartwright Street",
    lat: 49.2694438,
    lng: -123.1340877,
    description: "Permanent cruising spot with a shared message board. Category: Gyms.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:39.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved",
    moderatedAtMs: Date.parse("2026-03-12T00:00:39.000Z"),
    moderatedByUserId: "system:seed"
  }
];

const PERMANENT_CRUISING_SPOT_IDS = new Set(PERMANENT_CRUISING_SPOTS.map((spot) => spot.spotId));

function ok<T>(value: T): ResultOk<T> {
  return { ok: true, value };
}

function err(code: ErrorCode, message: string, context?: Record<string, unknown>): ResultErr {
  return { ok: false, error: context ? { code, message, context } : { code, message } };
}

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asOptionalText(value: unknown): string | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function mergePermanentCruisingSpots(spots: ReadonlyArray<CruisingSpot>): CruisingSpot[] {
  const byId = new Map<string, CruisingSpot>();
  for (const spot of PERMANENT_CRUISING_SPOTS) byId.set(spot.spotId, spot);
  for (const spot of spots) byId.set(spot.spotId, spot);
  return Array.from(byId.values());
}

function actorKey(session: SessionLike): string {
  if (typeof session.userId === "string" && session.userId.trim() !== "") return `user:${session.userId}`;
  const token = typeof session.sessionToken === "string" ? session.sessionToken.trim() : "";
  return `session:${token}`;
}

function requireAge(session: SessionLike): Result<void> {
  if (session.ageVerified !== true) {
    return err("AGE_GATE_REQUIRED", "You must be 18 or older to use Red Door.", { minimumAge: 18 });
  }
  return ok(undefined);
}

export function createCruisingSpotsService(
  deps?: Readonly<{
    nowMs?: () => number;
    idFactory?: () => string;
    persistenceFilePath?: string;
    initialState?: CruisingSpotsState;
    onStateChanged?: (state: CruisingSpotsState) => void;
  }>
): Readonly<{
  list(viewer?: SessionLike): Result<ReadonlyArray<CruisingSpot>>;
  listAll(): Result<ReadonlyArray<CruisingSpot>>;
  create(
    session: SessionLike,
    input: Readonly<{ name: unknown; address: unknown; lat: unknown; lng: unknown; description: unknown; photoMediaId?: unknown }>
  ): Result<CruisingSpot>;
  checkIn(session: SessionLike, spotId: unknown): Result<SpotCheckIn>;
  recordAction(session: SessionLike, spotId: unknown): Result<{ spotId: string; actorKey: string; markedAtMs: number }>;
  listCheckIns(spotId: unknown): Result<ReadonlyArray<SpotCheckIn>>;
  approve(adminSession: SessionLike, spotId: unknown, reason?: unknown): Result<CruisingSpot>;
  reject(adminSession: SessionLike, spotId: unknown, reason?: unknown): Result<CruisingSpot>;
  remove(spotId: unknown): Result<{ spotId: string }>;
}> {
  const nowMs = deps?.nowMs ?? (() => Date.now());
  const idFactory = deps?.idFactory ?? (() => `spot_${Math.random().toString(16).slice(2)}_${Date.now()}`);
  const persistenceFilePath = deps?.persistenceFilePath;
  const onStateChanged = deps?.onStateChanged;
  const spots: CruisingSpot[] = [];
  const checkInsBySpot = new Map<string, Map<string, SpotCheckIn>>();
  const actionBySpot = new Map<string, Map<string, { spotId: string; actorKey: string; markedAtMs: number }>>();

  function updateSpotCounts(spotId: string): void {
    const idx = spots.findIndex((s) => s.spotId === spotId);
    if (idx < 0) return;
    const checkInCount = (checkInsBySpot.get(spotId) ?? new Map()).size;
    const actionCount = (actionBySpot.get(spotId) ?? new Map()).size;
    spots[idx] = { ...spots[idx], checkInCount, actionCount };
  }

  function snapshotStateInternal(): CruisingSpotsState {
    return {
      spots: [...spots],
      checkIns: Array.from(checkInsBySpot.entries()).map(([spotId, rows]) => ({
        spotId,
        rows: Array.from(rows.values())
      })),
      actions: Array.from(actionBySpot.entries()).map(([spotId, rows]) => ({
        spotId,
        rows: Array.from(rows.values())
      }))
    };
  }

  function notifyStateChanged(): void {
    if (!onStateChanged) return;
    try {
      onStateChanged(snapshotStateInternal());
    } catch {
      // hooks are best effort
    }
  }

  function persistState(): void {
    if (!persistenceFilePath) {
      notifyStateChanged();
      return;
    }
    const dir = path.dirname(persistenceFilePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      persistenceFilePath,
      JSON.stringify({ version: 1, ...snapshotStateInternal() }),
      "utf8"
    );
    notifyStateChanged();
  }

  function hydrateSpotCounts(): void {
    for (const spot of spots) updateSpotCounts(spot.spotId);
  }

  function loadState(): void {
    const initial = deps?.initialState;
    const applyState = (state: CruisingSpotsState): void => {
      spots.splice(0, spots.length, ...mergePermanentCruisingSpots(state.spots ?? []));
      checkInsBySpot.clear();
      actionBySpot.clear();
      for (const group of state.checkIns ?? []) {
        if (!group || typeof group.spotId !== "string") continue;
        const map = new Map<string, SpotCheckIn>();
        for (const row of group.rows ?? []) {
          if (!row || typeof row.actorKey !== "string") continue;
          map.set(row.actorKey, row);
        }
        checkInsBySpot.set(group.spotId, map);
      }
      for (const group of state.actions ?? []) {
        if (!group || typeof group.spotId !== "string") continue;
        const map = new Map<string, { spotId: string; actorKey: string; markedAtMs: number }>();
        for (const row of group.rows ?? []) {
          if (!row || typeof row.actorKey !== "string") continue;
          map.set(row.actorKey, row);
        }
        actionBySpot.set(group.spotId, map);
      }
      hydrateSpotCounts();
    };
    if (initial) {
      applyState(initial);
      return;
    }
    if (!persistenceFilePath) {
      applyState({ spots: [], checkIns: [], actions: [] });
      return;
    }
    if (!fs.existsSync(persistenceFilePath)) {
      applyState({ spots: [], checkIns: [], actions: [] });
      return;
    }
    const raw = fs.readFileSync(persistenceFilePath, "utf8");
    if (!raw.trim()) {
      applyState({ spots: [], checkIns: [], actions: [] });
      return;
    }
    const parsed = JSON.parse(raw) as { version?: unknown; spots?: unknown; checkIns?: unknown; actions?: unknown };
    if (parsed.version !== 1) return;
    applyState({
      spots: Array.isArray(parsed.spots) ? (parsed.spots as ReadonlyArray<CruisingSpot>) : [],
      checkIns: Array.isArray(parsed.checkIns) ? (parsed.checkIns as CruisingSpotsState["checkIns"]) : [],
      actions: Array.isArray(parsed.actions) ? (parsed.actions as CruisingSpotsState["actions"]) : []
    });
  }

  loadState();

  return {
    list(viewer?: SessionLike): Result<ReadonlyArray<CruisingSpot>> {
      const isAdmin = viewer?.role === "admin";
      const viewerActorKey = viewer ? actorKey(viewer) : null;
      const visible = isAdmin
        ? spots
        : spots.filter((spot) => {
            if (spot.moderationStatus === "approved") return true;
            return viewerActorKey !== null && spot.creatorUserId === viewerActorKey;
          });
      return ok([...visible].sort((a, b) => b.createdAtMs - a.createdAtMs));
    },

    listAll(): Result<ReadonlyArray<CruisingSpot>> {
      return ok([...spots].sort((a, b) => b.createdAtMs - a.createdAtMs));
    },

    create(
      session: SessionLike,
      input: Readonly<{ name: unknown; description: unknown; address: unknown; lat: unknown; lng: unknown; photoMediaId?: unknown }>
    ): Result<CruisingSpot> {
      const name = asText(input.name);
      const description = asText(input.description);
      const address = asText(input.address);
      const photoMediaId = asOptionalText(input.photoMediaId);
      const lat = typeof input.lat === "number" && Number.isFinite(input.lat) ? input.lat : null;
      const lng = typeof input.lng === "number" && Number.isFinite(input.lng) ? input.lng : null;
      if (!name) return err("INVALID_INPUT", "Spot name is required.");
      if (!address) return err("INVALID_INPUT", "Spot address is required.");
      if (!description) return err("INVALID_INPUT", "Spot description is required.");
      if (photoMediaId === null) return err("INVALID_INPUT", "photoMediaId must be a string when provided.");
      if (lat === null || lng === null) return err("INVALID_INPUT", "Spot coordinates are required.");
      if (name.length > 120) return err("INVALID_INPUT", "Spot name is too long.", { max: 120 });
      if (address.length > 240) return err("INVALID_INPUT", "Spot address is too long.", { max: 240 });
      if (description.length > 1000) return err("INVALID_INPUT", "Spot description is too long.", { max: 1000 });
      if (containsDisallowedKidVariation(name)) return err("INVALID_INPUT", "Spot name contains disallowed language.");
      if (containsDisallowedKidVariation(address)) return err("INVALID_INPUT", "Spot address contains disallowed language.");
      if (containsDisallowedKidVariation(description)) return err("INVALID_INPUT", "Spot description contains disallowed language.");
      if (typeof photoMediaId === "string" && photoMediaId.length > 200) return err("INVALID_INPUT", "photoMediaId is too long.", { max: 200 });
      const spot: CruisingSpot = {
        spotId: idFactory(),
        name,
        address,
        lat,
        lng,
        description,
        ...(photoMediaId ? { photoMediaId } : {}),
        creatorUserId: actorKey(session),
        createdAtMs: nowMs(),
        checkInCount: 0,
        actionCount: 0,
        moderationStatus: "approved",
        moderatedAtMs: nowMs(),
        moderatedByUserId: "system:auto"
      };
      spots.push(spot);
      persistState();
      return ok(spot);
    },

    checkIn(session: SessionLike, spotId: unknown): Result<SpotCheckIn> {
      const age = requireAge(session);
      if (!age.ok) return age as Result<SpotCheckIn>;
      const id = asText(spotId);
      if (!id) return err("INVALID_INPUT", "Spot id is required.");
      if (!spots.some((s) => s.spotId === id)) return err("SPOT_NOT_FOUND", "Cruising spot not found.");
      const key = actorKey(session);
      const record: SpotCheckIn = { spotId: id, actorKey: key, checkedInAtMs: nowMs() };
      const map = checkInsBySpot.get(id) ?? new Map<string, SpotCheckIn>();
      map.set(key, record);
      checkInsBySpot.set(id, map);
      updateSpotCounts(id);
      persistState();
      return ok(record);
    },

    recordAction(session: SessionLike, spotId: unknown): Result<{ spotId: string; actorKey: string; markedAtMs: number }> {
      const age = requireAge(session);
      if (!age.ok) return age as Result<{ spotId: string; actorKey: string; markedAtMs: number }>;
      const id = asText(spotId);
      if (!id) return err("INVALID_INPUT", "Spot id is required.");
      if (!spots.some((s) => s.spotId === id)) return err("SPOT_NOT_FOUND", "Cruising spot not found.");
      const actor = actorKey(session);
      const row = { spotId: id, actorKey: actor, markedAtMs: nowMs() };
      const map = actionBySpot.get(id) ?? new Map<string, { spotId: string; actorKey: string; markedAtMs: number }>();
      map.set(actor, row);
      actionBySpot.set(id, map);
      updateSpotCounts(id);
      persistState();
      return ok(row);
    },

    listCheckIns(spotId: unknown): Result<ReadonlyArray<SpotCheckIn>> {
      const id = asText(spotId);
      if (!id) return err("INVALID_INPUT", "Spot id is required.");
      if (!spots.some((s) => s.spotId === id)) return err("SPOT_NOT_FOUND", "Cruising spot not found.");
      const values = Array.from((checkInsBySpot.get(id) ?? new Map()).values()).sort((a, b) => b.checkedInAtMs - a.checkedInAtMs);
      return ok(values);
    },

    approve(adminSession: SessionLike, spotId: unknown, reason?: unknown): Result<CruisingSpot> {
      const id = asText(spotId);
      if (!id) return err("INVALID_INPUT", "Spot id is required.");
      const idx = spots.findIndex((s) => s.spotId === id);
      if (idx < 0) return err("SPOT_NOT_FOUND", "Cruising spot not found.");
      const adminUserId = typeof adminSession.userId === "string" && adminSession.userId.trim() ? adminSession.userId : "system";
      const reasonText = typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 500) : undefined;
      spots[idx] = {
        ...spots[idx],
        moderationStatus: "approved",
        moderatedAtMs: nowMs(),
        moderatedByUserId: adminUserId,
        ...(reasonText ? { moderationReason: reasonText } : {})
      };
      persistState();
      return ok(spots[idx]);
    },

    reject(adminSession: SessionLike, spotId: unknown, reason?: unknown): Result<CruisingSpot> {
      const id = asText(spotId);
      if (!id) return err("INVALID_INPUT", "Spot id is required.");
      const idx = spots.findIndex((s) => s.spotId === id);
      if (idx < 0) return err("SPOT_NOT_FOUND", "Cruising spot not found.");
      const adminUserId = typeof adminSession.userId === "string" && adminSession.userId.trim() ? adminSession.userId : "system";
      const reasonText = typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 500) : undefined;
      spots[idx] = {
        ...spots[idx],
        moderationStatus: "rejected",
        moderatedAtMs: nowMs(),
        moderatedByUserId: adminUserId,
        ...(reasonText ? { moderationReason: reasonText } : {})
      };
      persistState();
      return ok(spots[idx]);
    },

    remove(spotId: unknown): Result<{ spotId: string }> {
      const id = asText(spotId);
      if (!id) return err("INVALID_INPUT", "Spot id is required.");
      if (PERMANENT_CRUISING_SPOT_IDS.has(id)) {
        return err("INVALID_INPUT", "Built-in cruising spots cannot be removed.");
      }
      const idx = spots.findIndex((s) => s.spotId === id);
      if (idx < 0) return err("SPOT_NOT_FOUND", "Cruising spot not found.");
      spots.splice(idx, 1);
      checkInsBySpot.delete(id);
      actionBySpot.delete(id);
      persistState();
      return ok({ spotId: id });
    }
  };
}
