export type ServiceError = Readonly<{
  code: string;
  message: string;
  context?: Record<string, unknown>;
}>;

export type Session = Readonly<{
  sessionToken: string;
  userType: "guest" | "registered" | "subscriber";
  tier: "free" | "premium";
  role?: "user" | "admin";
  mode: "cruise" | "date" | "hybrid";
  userId?: string;
  ageVerified: boolean;
  hybridOptIn: boolean;
  expiresAtMs: number;
}>;

export type VerifyEmailOrLoginResponse = Readonly<{
  user: {
    id: string;
    email: string;
    userType: "registered" | "subscriber";
    tier: "free" | "premium";
    role?: "user" | "admin";
    bannedAtMs?: number | null;
    bannedReason?: string | null;
  };
  jwt: string;
  session: Session;
}>;

export type RegisterResponse = Readonly<{
  email: string;
  verificationRequired: true;
}>;

export type GuestResponse = Readonly<{ session: Session }>;

export type DatingProfile = Readonly<{
  id: string;
  displayName: string;
  age?: number;
  race?: string;
  heightInches?: number;
  weightLbs?: number;
  cockSizeInches?: number;
  cutStatus?: "cut" | "uncut";
  distanceBucket?: "<500m" | "<1km" | "<5km" | ">5km";
}>;

export type FeedResponse = Readonly<{ profiles: ReadonlyArray<DatingProfile> }>;

export type SwipeResponse = Readonly<{
  matchCreated: boolean;
  match?: { matchId: string; userA: string; userB: string; createdAtMs: number };
}>;

export type ProfileCutStatus = "cut" | "uncut";
export type ProfilePosition = "top" | "bottom" | "side";

export type UserProfile = Readonly<{
  userId: string;
  displayName: string;
  age: number;
  bio: string;
  stats: Readonly<{
    heightInches?: number;
    race?: string;
    cockSizeInches?: number;
    cutStatus?: ProfileCutStatus;
    weightLbs?: number;
    position?: ProfilePosition;
  }>;
  discreetMode?: boolean;
  travelMode?: Readonly<{ enabled: boolean; lat?: number; lng?: number }>;
  mainPhotoMediaId?: string;
  galleryMediaIds: ReadonlyArray<string>;
  videoMediaId?: string;
  updatedAtMs: number;
}>;

export type PublicProfile = Readonly<{
  userId: string;
  displayName: string;
  age: number;
  bio: string;
  stats: Readonly<{
    heightInches?: number;
    race?: string;
    cockSizeInches?: number;
    cutStatus?: ProfileCutStatus;
    weightLbs?: number;
    position?: ProfilePosition;
  }>;
  discreetMode?: boolean;
  mainPhotoMediaId?: string;
  galleryMediaIds: ReadonlyArray<string>;
  videoMediaId?: string;
  updatedAtMs: number;
}>;

export type ProfileUpdatePayload = Readonly<{
  displayName: string;
  age: number;
  bio: string;
  stats: Readonly<{
    heightInches?: number;
    race?: string;
    cockSizeInches?: number;
    cutStatus?: ProfileCutStatus;
    weightLbs?: number;
    position?: ProfilePosition;
  }>;
  discreetMode?: boolean;
  travelMode?: Readonly<{ enabled: boolean; lat?: number; lng?: number }>;
}>;

export type RegistrationProfileInput = Readonly<{
  displayName: string;
  age: number;
  stats?: ProfileUpdatePayload["stats"];
}>;

export type MediaKind = "photo_main" | "photo_gallery" | "video";

export type InitiateMediaUploadResponse = Readonly<{
  mediaId: string;
  uploadUrl: string;
  objectKey: string;
  expiresInSeconds: number;
}>;

export type FavoriteToggleResponse = Readonly<{
  targetUserId: string;
  isFavorite: boolean;
  favorites: ReadonlyArray<string>;
}>;

export type PublicPosting = Readonly<{
  postingId: string;
  type: "ad" | "event";
  title: string;
  body: string;
  photoMediaId?: string;
  lat?: number;
  lng?: number;
  eventStartAtMs?: number;
  locationInstructions?: string;
  groupDetails?: string;
  authorUserId: string;
  createdAtMs: number;
  invitedUserIds?: ReadonlyArray<string>;
  acceptedUserIds?: ReadonlyArray<string>;
  joinRequestUserIds?: ReadonlyArray<string>;
  moderationStatus?: "pending" | "approved" | "rejected";
}>;

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
  moderationStatus?: "pending" | "approved" | "rejected";
}>;

export type Submission = Readonly<{
  submissionId: string;
  authorUserId: string;
  title: string;
  body: string;
  viewCount: number;
  ratingCount: number;
  ratingSum: number;
  createdAtMs: number;
  moderationStatus?: "pending" | "approved" | "rejected";
}>;

export type PromotedProfileListing = Readonly<{
  listingId: string;
  userId: string;
  title: string;
  body: string;
  displayName: string;
  createdAtMs: number;
}>;

export type AdminUserSummary = Readonly<{
  id: string;
  email: string;
  userType: "registered" | "subscriber";
  tier: "free" | "premium";
  role?: "user" | "admin";
  ageVerified: boolean;
  emailVerified: boolean;
  bannedAtMs?: number | null;
  bannedReason?: string | null;
  createdAtMs: number;
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
    moderationStatus: "approved"
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
    moderationStatus: "approved"
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
    moderationStatus: "approved"
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
    moderationStatus: "approved"
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
    moderationStatus: "approved"
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
    moderationStatus: "approved"
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
    moderationStatus: "approved"
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
    moderationStatus: "approved"
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
    moderationStatus: "approved"
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
    moderationStatus: "approved"
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
    moderationStatus: "approved"
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
    moderationStatus: "approved"
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
    moderationStatus: "approved"
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
    moderationStatus: "approved"
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
    moderationStatus: "approved"
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
    moderationStatus: "approved"
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
    moderationStatus: "approved"
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
    moderationStatus: "approved"
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
    moderationStatus: "approved"
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
    moderationStatus: "approved"
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
    moderationStatus: "approved"
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
    moderationStatus: "approved"
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
    moderationStatus: "approved"
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
    moderationStatus: "approved"
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
    moderationStatus: "approved"
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
    moderationStatus: "approved"
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
    moderationStatus: "approved"
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
    moderationStatus: "approved"
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
    moderationStatus: "approved"
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
    moderationStatus: "approved"
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
    moderationStatus: "approved"
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
    moderationStatus: "approved"
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
    moderationStatus: "approved"
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
    moderationStatus: "approved"
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
    moderationStatus: "approved"
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
    moderationStatus: "approved"
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
    moderationStatus: "approved"
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
    moderationStatus: "approved"
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
    moderationStatus: "approved"
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
    moderationStatus: "approved"
  },
  {
    spotId: "spot_van_vancouver_public_library",
    name: "Vancouver Public Library",
    address: "350 West Georgia Street",
    lat: 49.279659,
    lng: -123.115614,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:40.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_van_delta_hotels_vancouver_downtown",
    name: "Delta Hotels by Marriott Vancouver",
    address: "550 West Hastings Street",
    lat: 49.2841528,
    lng: -123.1126616,
    description: "Permanent cruising spot with a shared message board. Categories: Hotels, Resorts, Campgrounds.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:41.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_van_kitsilano_beach",
    name: "Kitsilano Beach",
    address: "Kitsilano Beach",
    lat: 49.2756531,
    lng: -123.1537326,
    description: "Permanent cruising spot with a shared message board. Category: Cruising Areas.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:42.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_van_andy_livingstone_park",
    name: "Andy Livingstone Park",
    address: "Andy Livingstone Park",
    lat: 49.278457,
    lng: -123.103763,
    description: "Permanent cruising spot with a shared message board. Category: Parks.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:43.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_van_crab_park_at_portside",
    name: "Crab Park",
    address: "CRAB Park at Portside",
    lat: 49.2854169,
    lng: -123.100346,
    description: "Permanent cruising spot with a shared message board. Category: Parks.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:44.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_van_pacific_centre",
    name: "Pacific Centre",
    address: "701 West Georgia Street",
    lat: 49.2822466,
    lng: -123.119484,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:45.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_van_ywca_hornby",
    name: "YWCA",
    address: "535 Hornby Street",
    lat: 49.285466,
    lng: -123.117782,
    description: "Permanent cruising spot with a shared message board. Category: Gyms.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:46.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_van_waterfront_centre",
    name: "Waterfront Centre",
    address: "200 Burrard Street",
    lat: 49.287666,
    lng: -123.1151969,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:47.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_van_sfu_harbour_centre",
    name: "SFU Harbour Centre",
    address: "515 West Hastings Street",
    lat: 49.2845459,
    lng: -123.1116636,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:48.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_van_jw_marriott_lobby_washroom",
    name: "Jw Marriott Hotel Lobby Washroom",
    address: "39 Smithe Street",
    lat: 49.2753903,
    lng: -123.112766,
    description: "Permanent cruising spot with a shared message board. Categories: Hotels, Resorts, Campgrounds.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:49.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_van_evolve_strength_the_post",
    name: "Evolve Fitness at The Post",
    address: "658 Homer Street",
    lat: 49.28125,
    lng: -123.1134453,
    description: "Permanent cruising spot with a shared message board. Category: Gyms.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:50.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_van_international_village_mall",
    name: "International Village Mall Washrooms",
    address: "88 West Pender Street",
    lat: 49.280364,
    lng: -123.1066804,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:51.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_van_brockton_oval",
    name: "Brockton Oval",
    address: "Avison Way",
    lat: 49.2995532,
    lng: -123.1252342,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:52.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_van_hillcrest_pool",
    name: "Hillcrest pool",
    address: "4575 Clancy Loranger Way",
    lat: 49.2438126,
    lng: -123.1070606,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:53.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_van_queen_elizabeth_park",
    name: "Queen Elizabeth Park",
    address: "Queen Elizabeth Park",
    lat: 49.2410335,
    lng: -123.1119593,
    description: "Permanent cruising spot with a shared message board. Category: Parks.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:54.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_van_jericho_beach_park",
    name: "Jericho Beach Park",
    address: "Jericho Beach Park",
    lat: 49.2725995,
    lng: -123.1962845,
    description: "Permanent cruising spot with a shared message board. Category: Parks.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:55.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_van_langara_college",
    name: "Langara College",
    address: "100 West 49th Avenue",
    lat: 49.2249963,
    lng: -123.1086173,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:56.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_richmond_olympic_oval",
    name: "Richmond Olympics Oval",
    address: "6111 River Road",
    lat: 49.174693,
    lng: -123.1516757,
    description: "Permanent cruising spot with a shared message board. Category: Gyms.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:57.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_richmond_minoru_centre_active_living",
    name: "Minoru Centre for Active Living",
    address: "7191 Granville Avenue",
    lat: 49.1636592,
    lng: -123.1456525,
    description: "Permanent cruising spot with a shared message board. Category: Gyms.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:58.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_burnaby_deer_lake_park",
    name: "Deer Lake Park",
    address: "Deer Lake Park",
    lat: 49.2353111,
    lng: -122.9763674,
    description: "Permanent cruising spot with a shared message board. Category: Parks.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:00:59.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_burnaby_byrne_creek_ravine",
    name: "Byrne Creek Ravine Park",
    address: "Byrne Creek Ravine Park",
    lat: 49.2095802,
    lng: -122.9672326,
    description: "Permanent cruising spot with a shared message board. Category: Parks.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:00.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_van_new_brighton_park",
    name: "New Brighton Park Toilets",
    address: "New Brighton Park",
    lat: 49.2905087,
    lng: -123.0386069,
    description: "Permanent cruising spot with a shared message board. Category: Parks.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:01.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_burnaby_central_park",
    name: "Central Park - Burnaby",
    address: "Central Park",
    lat: 49.227573,
    lng: -123.0180725,
    description: "Permanent cruising spot with a shared message board. Category: Parks.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:02.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_richmond_garden_city_community_park",
    name: "Garden City Community Park",
    address: "Garden City Community Park",
    lat: 49.1645913,
    lng: -123.1224606,
    description: "Permanent cruising spot with a shared message board. Category: Parks.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:03.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_richmond_lansdowne_centre",
    name: "Lansdowne Mall",
    address: "5300 No. 3 Road",
    lat: 49.1755487,
    lng: -123.1324779,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:04.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_burnaby_metrotown",
    name: "Metrotown Office Galleria",
    address: "4700 Kingsway",
    lat: 49.2264338,
    lng: -123.0011791,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:05.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_richmond_nature_park",
    name: "Richmond Nature Park",
    address: "11851 Westminster Highway",
    lat: 49.1734849,
    lng: -123.0972474,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:06.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_burnaby_burnaby_lake_regional_park",
    name: "Burnaby Lake Clubhouse",
    address: "Burnaby Lake Regional Park",
    lat: 49.2470452,
    lng: -122.9226356,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:07.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_burnaby_bcit",
    name: "British Columbia Institute Of Technology",
    address: "3700 Willingdon Avenue",
    lat: 49.2481559,
    lng: -123.0012153,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:08.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_richmond_aberdeen_square",
    name: "Aberdeen Square",
    address: "400 No. 3 Road",
    lat: 49.184156,
    lng: -123.1356436,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:09.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_nvan_parkgate_park",
    name: "Parkgate Park",
    address: "Parkgate Park",
    lat: 49.3200928,
    lng: -122.9727712,
    description: "Permanent cruising spot with a shared message board. Category: Parks.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:10.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_burnaby_edmonds_park",
    name: "Edmonds Park Toilets",
    address: "Edmonds Park",
    lat: 49.22173,
    lng: -122.949187,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:11.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_newwest_queensborough_landing",
    name: "Queensborough Landing / Pier and Retail Area",
    address: "805 Boyd Street",
    lat: 49.1923436,
    lng: -122.9490038,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:12.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_newwest_royal_city_centre",
    name: "Royal City Centre Service Hallways",
    address: "610 Sixth Street",
    lat: 49.2125962,
    lng: -122.9223552,
    description: "Permanent cruising spot with a shared message board. Category: Cruising Areas.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:13.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_newwest_hume_park",
    name: "Hume Park",
    address: "Hume Park",
    lat: 49.2351727,
    lng: -122.890505,
    description: "Permanent cruising spot with a shared message board. Category: Parks.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:14.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_newwest_douglas_college",
    name: "Douglas College",
    address: "700 Royal Avenue",
    lat: 49.2036787,
    lng: -122.9131209,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:15.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_burnaby_confederation_park",
    name: "Confederation Park North Parking Lot",
    address: "Confederation Park",
    lat: 49.2867036,
    lng: -122.9999374,
    description: "Permanent cruising spot with a shared message board. Category: Parks.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:16.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_surrey_crescent_beach",
    name: "Crescent Beach Naturist Area",
    address: "Crescent Beach",
    lat: 49.0424917,
    lng: -122.8840268,
    description: "Permanent cruising spot with a shared message board. Categories: Beaches, Hot Springs.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:17.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_coquitlam_como_lake_park",
    name: "Como Lake Park",
    address: "Como Lake Park",
    lat: 49.2602938,
    lng: -122.8586157,
    description: "Permanent cruising spot with a shared message board. Category: Parks.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:18.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_surrey_tynehead_regional_park",
    name: "Tynehead Regional Park",
    address: "Tynehead Regional Park",
    lat: 49.1824515,
    lng: -122.7586812,
    description: "Permanent cruising spot with a shared message board. Category: Parks.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:19.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_richmond_no7_road_pier_park",
    name: "No. 7 Road Pier Park",
    address: "15811 No. 7 Road",
    lat: 49.2023703,
    lng: -123.0483829,
    description: "Permanent cruising spot with a shared message board. Category: Parks.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:20.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_burnaby_robert_burnaby_park",
    name: "Robert Burnaby Park",
    address: "8155 11th Avenue",
    lat: 49.2322829,
    lng: -122.9328007,
    description: "Permanent cruising spot with a shared message board. Category: Parks.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:21.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_coquitlam_minnekhada_regional_park",
    name: "Minnekhada Park",
    address: "Minnekhada Regional Park",
    lat: 49.3018537,
    lng: -122.6976615,
    description: "Permanent cruising spot with a shared message board. Category: Parks.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:22.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_newwest_port_royal_park",
    name: "Port Royal Park",
    address: "Port Royal Park",
    lat: 49.1946986,
    lng: -122.9234122,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:23.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_newwest_sapperton_landing_park",
    name: "Sapperton Landing",
    address: "Sapperton Landing Park",
    lat: 49.2200601,
    lng: -122.8912696,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:24.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_newwest_glenbrook_ravine_park",
    name: "Glenbrook Ravine Park",
    address: "Glenbrook Ravine Park",
    lat: 49.2180819,
    lng: -122.9012907,
    description: "Permanent cruising spot with a shared message board. Category: Cruising Areas.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:25.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_wvan_ambleside_park",
    name: "Ambleside Park",
    address: "Ambleside Park",
    lat: 49.3239429,
    lng: -123.1478711,
    description: "Permanent cruising spot with a shared message board. Categories: Beaches, Hot Springs.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:26.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_nvan_lonsdale_quay",
    name: "Lonsdale Quay",
    address: "Lonsdale Quay",
    lat: 49.3095361,
    lng: -123.0838831,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:27.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_burnaby_goodlife_metrotown",
    name: "Goodlife Gym - Metrotown",
    address: "4501 Kingsway",
    lat: 49.2303628,
    lng: -123.0040853,
    description: "Permanent cruising spot with a shared message board. Category: Gyms.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:28.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_burnaby_amazing_brentwood",
    name: "The Amazing Brentwood Mall",
    address: "The Amazing Brentwood",
    lat: 49.2673126,
    lng: -123.0024114,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:29.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_surrey_central_city_shopping_centre",
    name: "Central City Mall - Washrooms",
    address: "10153 King George Boulevard",
    lat: 49.1863975,
    lng: -122.8486054,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:30.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_surrey_kwomais_point_park",
    name: "Kwomais Point Park",
    address: "Kwomais Point Park",
    lat: 49.0268186,
    lng: -122.8691192,
    description: "Permanent cruising spot with a shared message board. Category: Parks.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:31.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_langley_campbell_valley_regional_park",
    name: "Campbell Valley Park",
    address: "Campbell Valley Regional Park",
    lat: 49.0209433,
    lng: -122.6580474,
    description: "Permanent cruising spot with a shared message board. Category: Parks.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:32.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_surrey_port_kells_park",
    name: "Port Kells Park",
    address: "19340 88 Avenue",
    lat: 49.1605716,
    lng: -122.6865069,
    description: "Permanent cruising spot with a shared message board. Category: Parks.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:33.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_surrey_bend_regional_park",
    name: "Surrey Bend Regional Park",
    address: "Surrey Bend Regional Park",
    lat: 49.2016042,
    lng: -122.7399099,
    description: "Permanent cruising spot with a shared message board. Category: Parks.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:34.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_surrey_colebrook_park",
    name: "Colebrook Park",
    address: "14311 Colebrook Road",
    lat: 49.0991772,
    lng: -122.8354114,
    description: "Permanent cruising spot with a shared message board. Category: Parks.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:35.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_wvan_horseshoe_bay_ferry_terminal",
    name: "BC Ferries- Vancouver to Victoria/Nanaimo/Gulf Islands",
    address: "6750 Keith Road",
    lat: 49.3685581,
    lng: -123.2758982,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:36.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_wvan_whytecliff_park",
    name: "Whytecliff Park",
    address: "Whytecliff Park",
    lat: 49.3740009,
    lng: -123.2873817,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:37.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_whiterock_east_beach",
    name: "White Rock East beach",
    address: "East Beach, White Rock",
    lat: 49.0190277,
    lng: -122.7996695,
    description: "Permanent cruising spot with a shared message board. Category: Cruising Areas.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:38.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_surrey_south_surrey_park_ride",
    name: "South surrey park and ride back parking lot",
    address: "3800 King George Boulevard",
    lat: 49.0719916,
    lng: -122.8223443,
    description: "Permanent cruising spot with a shared message board. Categories: Truck Stops, Rest Areas.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:39.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_saanich_mount_douglas_park",
    name: "Mount Douglas Park",
    address: "PKOLS (Mount Douglas Park)",
    lat: 48.4924506,
    lng: -123.3419568,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:40.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_surrey_beaver_creek_park",
    name: "Beaver Creek Park",
    address: "Beaver Creek Park",
    lat: 49.1219822,
    lng: -122.8825458,
    description: "Permanent cruising spot with a shared message board. Category: Cruising Areas.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:41.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_langley_meadows_edge_park",
    name: "Meadows Edge Park",
    address: "Meadows Edge Park",
    lat: 49.1231493,
    lng: -122.6703594,
    description: "Permanent cruising spot with a shared message board. Category: Parks.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:42.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_abbotsford_albert_dyck_park",
    name: "Albert Dyck Park",
    address: "31515 Huntingdon Road",
    lat: 49.0265449,
    lng: -122.347641,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:43.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_abbotsford_mill_lake_park",
    name: "Mill Lake Park",
    address: "Mill Lake Park",
    lat: 49.0445827,
    lng: -122.3113765,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:44.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_abbotsford_delair_park",
    name: "Delair Park",
    address: "33750 Farrell Avenue",
    lat: 49.0380314,
    lng: -122.2383488,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:45.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_nanaimo_bowen_park",
    name: "Bowen Park",
    address: "Bowen Park",
    lat: 49.1746341,
    lng: -123.9595037,
    description: "Permanent cruising spot with a shared message board. Category: Parks.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:46.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_nanaimo_colliery_dam_park",
    name: "Colliery Dam Park",
    address: "801 Seventh Street",
    lat: 49.1493377,
    lng: -123.9627542,
    description: "Permanent cruising spot with a shared message board. Category: Parks.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:47.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_saanich_elk_lake",
    name: "Elk Lake",
    address: "Elk Lake",
    lat: 48.5285908,
    lng: -123.3969737,
    description: "Permanent cruising spot with a shared message board. Category: Cruising Areas.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:48.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_saanich_commonwealth_place",
    name: "Commonwealth pool",
    address: "Commonwealth Place",
    lat: 48.5014697,
    lng: -123.3896494,
    description: "Permanent cruising spot with a shared message board. Category: Gyms.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:49.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_bc_spectacle_lake",
    name: "Spectacle Lake",
    address: "Spectacle Lake Provincial Park",
    lat: 48.5788065,
    lng: -123.5701732,
    description: "Permanent cruising spot with a shared message board. Categories: Beaches, Hot Springs.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:50.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_centralsaanich_island_view_beach",
    name: "Island View Beach",
    address: "Island View Beach Regional Park",
    lat: 48.5775885,
    lng: -123.3724296,
    description: "Permanent cruising spot with a shared message board. Categories: Beaches, Hot Springs.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:51.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_bc_cultus_lake",
    name: "Cultus Lake",
    address: "Cultus Lake",
    lat: 49.0552935,
    lng: -121.9836895,
    description: "Permanent cruising spot with a shared message board. Categories: Beaches, Hot Springs.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:52.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_bc_kilby_provincial_park",
    name: "Kilby Park and Campground",
    address: "Kilby Provincial Park",
    lat: 49.2375008,
    lng: -121.9634843,
    description: "Permanent cruising spot with a shared message board. Category: Parks.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:53.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_bc_alice_lake_provincial_park",
    name: "Alice Lake",
    address: "Alice Lake Provincial Park",
    lat: 49.7843452,
    lng: -123.1183626,
    description: "Permanent cruising spot with a shared message board. Category: Cruising Areas.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:54.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_nanaimo_woodgrove_centre",
    name: "Woodgrove Centre",
    address: "6631 Island Highway North",
    lat: 49.2366617,
    lng: -124.0504597,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:55.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_nanaimo_north_town_centre",
    name: "Nanaimo North Town Centre",
    address: "4750 Rutherford Road",
    lat: 49.2182253,
    lng: -124.0291688,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:56.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_nanaimo_serauxmen_stadium",
    name: "Serauxmen stadium",
    address: "745 Third Street",
    lat: 49.1607942,
    lng: -123.9656992,
    description: "Permanent cruising spot with a shared message board. Categories: Truck Stops, Rest Areas.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:57.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_nanaimo_beban_park",
    name: "Beban park",
    address: "2253 Bowen Road",
    lat: 49.1971252,
    lng: -123.991575,
    description: "Permanent cruising spot with a shared message board. Category: Parks.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:58.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_nanaimo_buttertubs_marsh",
    name: "Buttertubs Marsh Nanaimo BC",
    address: "Buttertubs Marsh",
    lat: 49.1702107,
    lng: -123.9736054,
    description: "Permanent cruising spot with a shared message board. Category: Cruising Areas.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:01:59.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_ladysmith_transfer_beach",
    name: "Transfer Beach Ladysmith.",
    address: "Transfer Beach Park",
    lat: 48.9907977,
    lng: -123.8091183,
    description: "Permanent cruising spot with a shared message board. Categories: Beaches, Hot Springs.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:02:00.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_cedar_morden_colliery_regional_trail",
    name: "Morden Colliery",
    address: "Morden Colliery Regional Trail",
    lat: 49.1076708,
    lng: -123.8412097,
    description: "Permanent cruising spot with a shared message board. Category: Parks.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:02:01.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_duncan_somenos_marsh",
    name: "Somenos Marsh",
    address: "Somenos Marsh Open Air Classroom",
    lat: 48.7905545,
    lng: -123.7099228,
    description: "Permanent cruising spot with a shared message board. Category: Parks.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:02:02.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_duncan_cowichan_community_centre",
    name: "Cowichan Community/Aquatic Centre",
    address: "2687 James Street",
    lat: 48.7827714,
    lng: -123.7031414,
    description: "Permanent cruising spot with a shared message board. Category: Gyms.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:02:03.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_northsaanich_victoria_international_airport",
    name: "Victoria Airport",
    address: "Victoria International Airport",
    lat: 48.6463019,
    lng: -123.421709,
    description: "Permanent cruising spot with a shared message board. Categories: Washrooms, Cottages.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:02:04.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_sidney_tulista_park",
    name: "Tulista Park",
    address: "Tulista Park",
    lat: 48.6425146,
    lng: -123.3992594,
    description: "Permanent cruising spot with a shared message board. Category: Parks.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:02:05.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
  {
    spotId: "spot_shawnigan_shawnigan_wharf_park",
    name: "Shawnigan wharf park",
    address: "Shawnigan Wharf Park",
    lat: 48.6522142,
    lng: -123.6261032,
    description: "Permanent cruising spot with a shared message board. Categories: Beaches, Hot Springs.",
    creatorUserId: "system:seed",
    createdAtMs: Date.parse("2026-03-12T00:02:06.000Z"),
    checkInCount: 0,
    actionCount: 0,
    moderationStatus: "approved"
  },
];

const PERMANENT_CRUISING_SPOT_IDS = new Set(PERMANENT_CRUISING_SPOTS.map((spot) => spot.spotId));

async function readJsonOrThrow(res: Response): Promise<any> {
  const text = await res.text();
  const parsed = text.length ? JSON.parse(text) : null;
  if (res.ok) return parsed;
  // Backend errors are already in {code,message,context?}; surface verbatim.
  throw parsed as ServiceError;
}

type ChatKind = "cruise" | "date";

type LocalChatMessage = Readonly<{
  messageId: string;
  chatKind: ChatKind;
  fromKey: string;
  toKey: string;
  text: string;
  media?: Readonly<{ kind: "image" | "video" | "audio"; objectKey: string; mimeType: string; durationSeconds?: number }>;
  createdAtMs: number;
  deliveredAtMs?: number;
  readAtMs?: number;
}>;

type LocalPresence = Readonly<{
  key: string;
  userType: "guest" | "registered" | "subscriber";
  lat: number;
  lng: number;
  status?: string;
  updatedAtMs: number;
}>;

type LocalMediaRecord = Readonly<{
  mediaId: string;
  objectKey: string;
  ownerUserId: string;
  kind: MediaKind;
  mimeType: string;
  uploaded: boolean;
  dataUrl?: string;
  createdAtMs: number;
}>;

type LocalChatMediaRecord = Readonly<{
  objectKey: string;
  mimeType: string;
  dataUrl?: string;
  createdAtMs: number;
}>;

type LocalUser = Readonly<{
  id: string;
  email: string;
  password: string;
  phoneE164: string;
  verified: boolean;
  userType: "registered" | "subscriber";
  tier: "free" | "premium";
}>;

type LocalState = Readonly<{
  usersById: Record<string, LocalUser>;
  userIdByEmail: Record<string, string>;
  verificationCodesByEmail: Record<string, string>;
  sessionsByToken: Record<string, Session>;
  profilesByUserId: Record<string, UserProfile>;
  favoritesByUserId: Record<string, ReadonlyArray<string>>;
  blockedByActorKey: Record<string, ReadonlyArray<string>>;
  presenceByKey: Record<string, LocalPresence>;
  messages: ReadonlyArray<LocalChatMessage>;
  likes: Record<string, ReadonlyArray<string>>;
  reports: ReadonlyArray<Readonly<{ type: "user" | "message"; actorKey: string; targetKey?: string; messageId?: string; reason: string; createdAtMs: number }>>;
  mediaById: Record<string, LocalMediaRecord>;
  mediaIdByObjectKey: Record<string, string>;
  chatMediaByObjectKey: Record<string, LocalChatMediaRecord>;
  publicPostings: ReadonlyArray<PublicPosting>;
  cruisingSpots: ReadonlyArray<CruisingSpot>;
  spotCheckIns: ReadonlyArray<Readonly<{ spotId: string; actorKey: string; checkedInAtMs: number }>>;
  spotActions: ReadonlyArray<Readonly<{ spotId: string; actorKey: string; markedAtMs: number }>>;
  submissions: ReadonlyArray<Submission>;
  promotedProfiles: ReadonlyArray<PromotedProfileListing>;
  promotedPaymentsByToken: Record<string, Readonly<{ paymentToken: string; ownerUserId: string; amountCents: number; status: "started" | "confirmed"; expiresAtMs: number }>>;
}>;

const LOCAL_STATE_KEY = "reddoor_local_state_v1";
const LOCAL_AUTH_STATE_KEY = "reddoor_local_auth_state_v1";
const LOCAL_UPLOAD_PREFIX = "rdlocal://";
// Full-page web navigation requires durable local state across reloads.
const LOCAL_PERSIST_ENABLED = true;
const LOCAL_ADMIN_EMAILS = new Set<string>(["admin@robbiecalvin.com", "robert.calvin.dev@gmail.com"]);
const DISALLOWED_KID_VARIATION_PATTERN =
  /(^|[^a-z0-9])k+[\W_]*[i1!|l]+[\W_]*d+(?:[\W_]*(?:s|z|do|dos|dy|die|dies))?(?=$|[^a-z0-9])/i;

type LocalAuthState = Readonly<{
  usersById: LocalState["usersById"];
  userIdByEmail: LocalState["userIdByEmail"];
  sessionsByToken: LocalState["sessionsByToken"];
  profilesByUserId: LocalState["profilesByUserId"];
  favoritesByUserId: LocalState["favoritesByUserId"];
  blockedByActorKey: LocalState["blockedByActorKey"];
}>;

function isLocalApiMode(basePath: string): boolean {
  const trimmed = basePath.trim().toLowerCase();
  return trimmed === "__local__" || trimmed === "local" || trimmed === "rdlocal";
}

function nowMs(): number {
  return Date.now();
}

function mergePermanentCruisingSpots(spots: ReadonlyArray<CruisingSpot>): ReadonlyArray<CruisingSpot> {
  const byId = new Map<string, CruisingSpot>();
  for (const spot of PERMANENT_CRUISING_SPOTS) byId.set(spot.spotId, spot);
  for (const spot of spots) byId.set(spot.spotId, spot);
  return Array.from(byId.values()).sort((a, b) => b.createdAtMs - a.createdAtMs);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function randomId(prefix: string): string {
  const globalCrypto = globalThis.crypto as Crypto | undefined;
  if (globalCrypto && typeof globalCrypto.randomUUID === "function") {
    return `${prefix}-${globalCrypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 12)}-${Date.now().toString(36)}`;
}

function containsDisallowedKidVariation(value: string): boolean {
  if (value.trim().length === 0) return false;
  return DISALLOWED_KID_VARIATION_PATTERN.test(value);
}

function parseLocalDisplayName(value: unknown): string {
  const displayName = typeof value === "string" ? value.trim() : "";
  if (!displayName) throw { code: "INVALID_INPUT", message: "Display name is required." } as ServiceError;
  if (displayName.length < 2 || displayName.length > 32) {
    throw { code: "INVALID_INPUT", message: "Display name must be 2-32 characters." } as ServiceError;
  }
  if (containsDisallowedKidVariation(displayName)) {
    throw { code: "INVALID_INPUT", message: "Display name contains disallowed language." } as ServiceError;
  }
  return displayName;
}

function parseLocalAge(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw { code: "INVALID_INPUT", message: "Age must be an integer." } as ServiceError;
  }
  const age = Math.trunc(value);
  if (age !== value) throw { code: "INVALID_INPUT", message: "Age must be an integer." } as ServiceError;
  if (age < 18) throw { code: "INVALID_INPUT", message: "Age must be 18 or older." } as ServiceError;
  if (age > 120) throw { code: "INVALID_INPUT", message: "Age is out of range." } as ServiceError;
  return age;
}

function createProfileFromInput(
  userId: string,
  input: Readonly<{
    displayName: unknown;
    age: unknown;
    bio?: unknown;
    stats?: unknown;
    discreetMode?: unknown;
    travelMode?: unknown;
  }>,
  existing?: UserProfile
): UserProfile {
  const ts = nowMs();
  const bio = typeof input.bio === "string" ? input.bio.trim() : "";
  if (bio.length > 280) throw { code: "INVALID_INPUT", message: "Bio must be 280 characters or fewer." } as ServiceError;
  if (containsDisallowedKidVariation(bio)) {
    throw { code: "INVALID_INPUT", message: "Bio contains disallowed language." } as ServiceError;
  }
  const nextStats =
    typeof input.stats === "object" && input.stats !== null
      ? (input.stats as ProfileUpdatePayload["stats"])
      : existing?.stats ?? {};
  const nextDiscreetMode = input.discreetMode === undefined ? existing?.discreetMode : input.discreetMode === true;
  const nextTravelMode =
    input.travelMode === undefined
      ? existing?.travelMode
      : (typeof input.travelMode === "object" && input.travelMode !== null
          ? (input.travelMode as UserProfile["travelMode"])
          : undefined);
  return {
    userId,
    displayName: parseLocalDisplayName(input.displayName),
    age: parseLocalAge(input.age),
    bio,
    stats: nextStats,
    discreetMode: nextDiscreetMode,
    travelMode: nextTravelMode,
    mainPhotoMediaId: existing?.mainPhotoMediaId,
    galleryMediaIds: existing?.galleryMediaIds ?? [],
    videoMediaId: existing?.videoMediaId,
    updatedAtMs: ts
  };
}

function emptyLocalState(): LocalState {
  return {
    usersById: {},
    userIdByEmail: {},
    verificationCodesByEmail: {},
    sessionsByToken: {},
    profilesByUserId: {},
    favoritesByUserId: {},
    blockedByActorKey: {},
    presenceByKey: {},
    messages: [],
    likes: {},
    reports: [],
    mediaById: {},
    mediaIdByObjectKey: {},
    chatMediaByObjectKey: {},
    publicPostings: [],
    cruisingSpots: mergePermanentCruisingSpots([]),
    spotCheckIns: [],
    spotActions: [],
    submissions: [],
    promotedProfiles: [],
    promotedPaymentsByToken: {}
  };
}

function loadLocalState(): LocalState {
  if (!LOCAL_PERSIST_ENABLED) return emptyLocalState();
  const auth = loadLocalAuthState();
  try {
    const raw = localStorage.getItem(LOCAL_STATE_KEY);
    if (!raw) {
      return { ...emptyLocalState(), ...auth };
    }
    const parsed = JSON.parse(raw) as LocalState;
    return { ...emptyLocalState(), ...parsed, cruisingSpots: mergePermanentCruisingSpots(parsed.cruisingSpots ?? []), ...auth };
  } catch {
    return { ...emptyLocalState(), ...auth };
  }
}

function saveLocalState(next: LocalState): void {
  if (!LOCAL_PERSIST_ENABLED) return;
  saveLocalAuthState(next);
  try {
    localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable; local mode degrades to in-memory for this session.
  }
}

function emptyLocalAuthState(): LocalAuthState {
  return {
    usersById: {},
    userIdByEmail: {},
    sessionsByToken: {},
    profilesByUserId: {},
    favoritesByUserId: {},
    blockedByActorKey: {}
  };
}

function loadLocalAuthState(): LocalAuthState {
  if (!LOCAL_PERSIST_ENABLED) return emptyLocalAuthState();
  try {
    const rawLocal = localStorage.getItem(LOCAL_AUTH_STATE_KEY);
    const rawSession = (() => {
      try {
        return sessionStorage.getItem(LOCAL_AUTH_STATE_KEY);
      } catch {
        return null;
      }
    })();
    const parsedLocal = rawLocal ? (JSON.parse(rawLocal) as Partial<LocalAuthState>) : {};
    const parsedSession = rawSession ? (JSON.parse(rawSession) as Partial<LocalAuthState>) : {};
    const parsed = { ...parsedLocal, ...parsedSession };
    return {
      usersById: parsed.usersById ?? {},
      userIdByEmail: parsed.userIdByEmail ?? {},
      sessionsByToken: parsed.sessionsByToken ?? {},
      profilesByUserId: parsed.profilesByUserId ?? {},
      favoritesByUserId: parsed.favoritesByUserId ?? {},
      blockedByActorKey: parsed.blockedByActorKey ?? {}
    };
  } catch {
    return emptyLocalAuthState();
  }
}

function saveLocalAuthState(next: LocalState): void {
  if (!LOCAL_PERSIST_ENABLED) return;
  const authState: LocalAuthState = {
    usersById: next.usersById,
    userIdByEmail: next.userIdByEmail,
    sessionsByToken: next.sessionsByToken,
    profilesByUserId: next.profilesByUserId,
    favoritesByUserId: next.favoritesByUserId,
    blockedByActorKey: next.blockedByActorKey
  };
  try {
    localStorage.setItem(LOCAL_AUTH_STATE_KEY, JSON.stringify(authState));
  } catch {
    // Best-effort backup for auth continuity across page navigation.
  }
  try {
    sessionStorage.setItem(LOCAL_AUTH_STATE_KEY, JSON.stringify(authState));
  } catch {
    // sessionStorage may be unavailable in strict privacy contexts.
  }
}

let inMemoryFallbackState: LocalState | null = null;

function readState(): LocalState {
  if (inMemoryFallbackState) return inMemoryFallbackState;
  const state = loadLocalState();
  inMemoryFallbackState = state;
  return state;
}

function writeState(state: LocalState, persist = true): void {
  const normalized = { ...state, cruisingSpots: mergePermanentCruisingSpots(state.cruisingSpots) };
  inMemoryFallbackState = normalized;
  if (!persist) return;
  saveLocalState(normalized);
}

function actorKeyForSession(session: Session): string {
  return session.userId ? `user:${session.userId}` : `session:${session.sessionToken}`;
}

function requireSession(state: LocalState, sessionToken: string): Session {
  const session = state.sessionsByToken[sessionToken];
  if (!session) {
    throw { code: "SESSION_NOT_FOUND", message: "Session not found." } as ServiceError;
  }
  return session;
}

function requireUserSession(state: LocalState, sessionToken: string): Session {
  const session = requireSession(state, sessionToken);
  if (!session.userId) {
    throw { code: "AUTH_REQUIRED", message: "Registered account required." } as ServiceError;
  }
  return session;
}

function requireAdminSession(state: LocalState, sessionToken: string): Session {
  const session = requireUserSession(state, sessionToken);
  if (session.role !== "admin") {
    throw { code: "FORBIDDEN", message: "Admin access required." } as ServiceError;
  }
  return session;
}

function roleForLocalEmail(email: string): "user" | "admin" {
  return LOCAL_ADMIN_EMAILS.has(email.trim().toLowerCase()) ? "admin" : "user";
}

function withUpdatedSession(state: LocalState, session: Session): LocalState {
  return {
    ...state,
    sessionsByToken: {
      ...state.sessionsByToken,
      [session.sessionToken]: session
    }
  };
}

function toPublicProfile(profile: UserProfile): PublicProfile {
  return {
    userId: profile.userId,
    displayName: profile.displayName,
    age: profile.age,
    bio: profile.bio,
    stats: profile.stats,
    discreetMode: profile.discreetMode,
    mainPhotoMediaId: profile.mainPhotoMediaId,
    galleryMediaIds: profile.galleryMediaIds,
    videoMediaId: profile.videoMediaId,
    updatedAtMs: profile.updatedAtMs
  };
}

function resolveMediaDataUrl(state: LocalState, mediaId: string): string {
  const record = state.mediaById[mediaId];
  if (!record || !record.dataUrl) {
    throw { code: "MEDIA_NOT_FOUND", message: "Media not found." } as ServiceError;
  }
  return record.dataUrl;
}

function toDistanceBucket(distanceMeters: number): DatingProfile["distanceBucket"] {
  if (distanceMeters < 500) return "<500m";
  if (distanceMeters < 1_000) return "<1km";
  if (distanceMeters < 5_000) return "<5km";
  return ">5km";
}

function distanceMeters(latA: number, lngA: number, latB: number, lngB: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadius = 6_371_000;
  const dLat = toRad(latB - latA);
  const dLng = toRad(lngB - lngA);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const h = s1 * s1 + Math.cos(toRad(latA)) * Math.cos(toRad(latB)) * s2 * s2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return earthRadius * c;
}

function normalizeChatPeerKey(raw: string): string {
  const key = raw.trim();
  if (!key) return key;
  if (key.startsWith("guest:")) return `session:${key.slice("guest:".length).trim()}`;
  if (key.startsWith("user:guest:")) return `session:${key.slice("user:guest:".length).trim()}`;
  return key;
}

function isCruiseSpotThreadKey(key: string): boolean {
  if (!key.startsWith("spot:")) return false;
  return key.slice("spot:".length).trim().length > 0;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Failed to read blob."));
    reader.readAsDataURL(blob);
  });
}

export async function uploadToLocalSignedUrl(uploadUrl: string, file: Blob, mimeType: string): Promise<boolean> {
  if (!uploadUrl.startsWith(LOCAL_UPLOAD_PREFIX)) return false;
  const token = uploadUrl.slice(LOCAL_UPLOAD_PREFIX.length);
  const sep = token.indexOf("/");
  if (sep <= 0) {
    throw { code: "MEDIA_UPLOAD_INVALID", message: "Invalid local upload URL." } as ServiceError;
  }
  const scope = token.slice(0, sep);
  const key = token.slice(sep + 1);
  const dataUrl = await blobToDataUrl(new Blob([file], { type: mimeType || "application/octet-stream" }));
  const state = readState();
  if (scope === "chat") {
    const record = state.chatMediaByObjectKey[key];
    if (!record) throw { code: "MEDIA_UPLOAD_INVALID", message: "Unknown chat upload key." } as ServiceError;
    writeState({
      ...state,
      chatMediaByObjectKey: {
        ...state.chatMediaByObjectKey,
        [key]: { ...record, dataUrl }
      }
    });
    return true;
  }
  if (scope === "profile") {
    const mediaId = state.mediaIdByObjectKey[key];
    if (!mediaId) throw { code: "MEDIA_UPLOAD_INVALID", message: "Unknown profile upload key." } as ServiceError;
    const media = state.mediaById[mediaId];
    if (!media) throw { code: "MEDIA_NOT_FOUND", message: "Media upload target not found." } as ServiceError;
    writeState({
      ...state,
      mediaById: {
        ...state.mediaById,
        [mediaId]: { ...media, dataUrl, uploaded: true }
      }
    });
    return true;
  }
  throw { code: "MEDIA_UPLOAD_INVALID", message: "Unknown local upload scope." } as ServiceError;
}

function createLocalApiClient(): Readonly<{
  createGuest(): Promise<GuestResponse>;
  register(email: string, password: string, phoneE164: string, profile: RegistrationProfileInput): Promise<RegisterResponse>;
  verifyEmail(email: string, code: string): Promise<VerifyEmailOrLoginResponse>;
  resendVerification(email: string): Promise<RegisterResponse>;
  login(email: string, password: string): Promise<VerifyEmailOrLoginResponse>;
  verifyAge(sessionToken: string, ageYears: number): Promise<{ session: Session }>;
  getSession(sessionToken: string): Promise<{ session: Session }>;
  getMode(sessionToken: string): Promise<{ mode: Session["mode"] }>;
  setHybridOptIn(sessionToken: string, optIn: boolean): Promise<{ session: Session }>;
  setMode(sessionToken: string, mode: Session["mode"]): Promise<{ session: Session }>;
  updatePresence(sessionToken: string, lat: number, lng: number, status?: string): Promise<any>;
  listActivePresence(sessionToken: string): Promise<{ presence: ReadonlyArray<{ key: string; userType: "guest" | "registered" | "subscriber"; lat: number; lng: number; status?: string; updatedAtMs: number }> }>;
  getDatingFeed(sessionToken: string): Promise<FeedResponse>;
  swipe(sessionToken: string, toUserId: string, direction: "like" | "pass"): Promise<SwipeResponse>;
  sendChat(
    sessionToken: string,
    chatKind: "cruise" | "date",
    toKey: string,
    text: string,
    media?: Readonly<{ kind: "image" | "video" | "audio"; objectKey: string; mimeType: string; durationSeconds?: number }>
  ): Promise<any>;
  sendCallSignal(
    sessionToken: string,
    payload: Readonly<{
      toKey: string;
      callId: string;
      signalType: "offer" | "answer" | "ice" | "hangup";
      sdp?: string;
      candidate?: string;
    }>
  ): Promise<{ ok: true }>;
  listChat(sessionToken: string, chatKind: "cruise" | "date", otherKey: string): Promise<any>;
  listChatThreads(
    sessionToken: string,
    chatKind: "cruise" | "date"
  ): Promise<{ threads: ReadonlyArray<Readonly<{ otherKey: string; lastMessage: LocalChatMessage }>> }>;
  markChatRead(sessionToken: string, chatKind: "cruise" | "date", otherKey: string): Promise<{ readAtMs: number }>;
  initiateChatMediaUpload(
    sessionToken: string,
    payload: Readonly<{ mimeType: string; sizeBytes: number }>
  ): Promise<{ objectKey: string; uploadUrl: string; mimeType: string; expiresInSeconds: number }>;
  getChatMediaUrl(sessionToken: string, objectKey: string): Promise<{ objectKey: string; downloadUrl: string; expiresInSeconds: number }>;
  block(sessionToken: string, targetKey: string): Promise<any>;
  unblock(sessionToken: string, targetKey: string): Promise<any>;
  listBlocked(sessionToken: string): Promise<{ blocked: ReadonlyArray<string> }>;
  reportUser(sessionToken: string, targetKey: string, reason: string): Promise<any>;
  reportMessage(sessionToken: string, messageId: string, reason: string, targetKey?: string): Promise<any>;
  getMyProfile(sessionToken: string): Promise<{ profile: UserProfile }>;
  getPublicProfiles(): Promise<{ profiles: ReadonlyArray<PublicProfile> }>;
  getPublicProfile(userId: string): Promise<{ profile: PublicProfile }>;
  getPublicMediaUrl(mediaId: string): Promise<{ downloadUrl: string }>;
  upsertMyProfile(sessionToken: string, payload: ProfileUpdatePayload): Promise<{ profile: UserProfile }>;
  updateProfileMediaReferences(
    sessionToken: string,
    payload: Readonly<{
      galleryMediaIds?: ReadonlyArray<string>;
      mainPhotoMediaId?: string;
    }>
  ): Promise<{ profile: UserProfile }>;
  initiateMediaUpload(
    sessionToken: string,
    payload: Readonly<{ kind: MediaKind; mimeType: string; sizeBytes: number }>
  ): Promise<InitiateMediaUploadResponse>;
  completeMediaUpload(sessionToken: string, mediaId: string): Promise<{ media: unknown }>;
  getFavorites(sessionToken: string): Promise<{ favorites: ReadonlyArray<string> }>;
  toggleFavorite(sessionToken: string, targetUserId: string): Promise<FavoriteToggleResponse>;
  listPublicPostings(type?: "ad" | "event", sessionToken?: string): Promise<{ postings: ReadonlyArray<PublicPosting> }>;
  createPublicPosting(
    sessionToken: string,
    payload: Readonly<{
      type: "ad" | "event";
      title: string;
      body: string;
      photoMediaId?: string;
      lat?: number;
      lng?: number;
      eventStartAtMs?: number;
      locationInstructions?: string;
      groupDetails?: string;
    }>
  ): Promise<{ posting: PublicPosting }>;
  inviteToEvent(
    sessionToken: string,
    payload: Readonly<{ postingId: string; targetUserId: string }>
  ): Promise<{ invite: { postingId: string; invitedUserId: string; invitedByUserId: string; createdAtMs: number } }>;
  respondToEventInvite(sessionToken: string, payload: Readonly<{ postingId: string; accept: boolean }>): Promise<{ posting: PublicPosting }>;
  requestToJoinEvent(sessionToken: string, payload: Readonly<{ postingId: string }>): Promise<{ posting: PublicPosting }>;
  respondToEventJoinRequest(
    sessionToken: string,
    payload: Readonly<{ postingId: string; targetUserId: string; accept: boolean }>
  ): Promise<{ posting: PublicPosting }>;
  listEventInvites(sessionToken: string): Promise<{ postings: ReadonlyArray<PublicPosting> }>;
  listCruisingSpots(sessionToken?: string): Promise<{ spots: ReadonlyArray<CruisingSpot> }>;
  createCruisingSpot(
    sessionToken: string,
    payload: Readonly<{ name: string; address: string; description: string; photoMediaId?: string }>
  ): Promise<{ spot: CruisingSpot }>;
  checkInCruisingSpot(sessionToken: string, spotId: string): Promise<{ checkIn: { spotId: string; actorKey: string; checkedInAtMs: number } }>;
  markCruisingSpotAction(sessionToken: string, spotId: string): Promise<{ action: { spotId: string; actorKey: string; markedAtMs: number } }>;
  listCruisingSpotCheckIns(spotId: string): Promise<{ checkIns: ReadonlyArray<{ spotId: string; actorKey: string; checkedInAtMs: number }> }>;
  listSubmissions(): Promise<{ submissions: ReadonlyArray<Submission> }>;
  createSubmission(sessionToken: string, payload: Readonly<{ title: string; body: string }>): Promise<{ submission: Submission }>;
  recordSubmissionView(submissionId: string): Promise<{ submission: Submission }>;
  rateSubmission(submissionId: string, stars: number): Promise<{ submission: Submission }>;
  adminListUsers(sessionToken: string): Promise<{ users: ReadonlyArray<AdminUserSummary> }>;
  adminBanUser(sessionToken: string, userId: string, reason?: string): Promise<{ user: Pick<AdminUserSummary, "id" | "bannedAtMs" | "bannedReason"> }>;
  adminUnbanUser(sessionToken: string, userId: string): Promise<{ user: Pick<AdminUserSummary, "id" | "bannedAtMs" | "bannedReason"> }>;
  adminListCruisingSpots(sessionToken: string): Promise<{ spots: ReadonlyArray<CruisingSpot> }>;
  adminApproveCruisingSpot(sessionToken: string, spotId: string, reason?: string): Promise<{ spot: CruisingSpot }>;
  adminRejectCruisingSpot(sessionToken: string, spotId: string, reason?: string): Promise<{ spot: CruisingSpot }>;
  adminDeleteCruisingSpot(sessionToken: string, spotId: string): Promise<{ spotId: string }>;
  adminListPublicPostings(sessionToken: string, type?: "ad" | "event"): Promise<{ postings: ReadonlyArray<PublicPosting> }>;
  adminApprovePublicPosting(sessionToken: string, postingId: string, reason?: string): Promise<{ posting: PublicPosting }>;
  adminRejectPublicPosting(sessionToken: string, postingId: string, reason?: string): Promise<{ posting: PublicPosting }>;
  adminDeletePublicPosting(sessionToken: string, postingId: string): Promise<{ postingId: string }>;
  adminListSubmissions(sessionToken: string): Promise<{ submissions: ReadonlyArray<Submission> }>;
  adminApproveSubmission(sessionToken: string, submissionId: string, reason?: string): Promise<{ submission: Submission }>;
  adminRejectSubmission(sessionToken: string, submissionId: string, reason?: string): Promise<{ submission: Submission }>;
  adminDeleteSubmission(sessionToken: string, submissionId: string): Promise<{ submissionId: string }>;
  listPromotedProfiles(): Promise<{ listings: ReadonlyArray<PromotedProfileListing>; feeCents: number }>;
  startPromotedPayment(sessionToken: string): Promise<{ payment: { paymentToken: string; amountCents: number; status: string; expiresAtMs: number } }>;
  confirmPromotedPayment(
    sessionToken: string,
    paymentToken: string
  ): Promise<{ payment: { paymentToken: string; amountCents: number; status: string; expiresAtMs: number } }>;
  createPromotedProfile(
    sessionToken: string,
    payload: Readonly<{ paymentToken: string; title: string; body: string; displayName: string }>
  ): Promise<{ listing: PromotedProfileListing }>;
}> {
  const feeCents = 499;

  return {
    async createGuest(): Promise<GuestResponse> {
      const sessionToken = randomId("session");
      const session: Session = {
        sessionToken,
        userType: "guest",
        tier: "free",
        role: "user",
        mode: "hybrid",
        ageVerified: false,
        hybridOptIn: true,
        expiresAtMs: nowMs() + 1000 * 60 * 60 * 24 * 14
      };
      const state = readState();
      writeState(withUpdatedSession(state, session));
      return { session: clone(session) };
    },
    async register(email: string, password: string, phoneE164: string, profile: RegistrationProfileInput): Promise<RegisterResponse> {
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail || !password) {
        throw { code: "INVALID_INPUT", message: "Email and password are required." } as ServiceError;
      }
      parseLocalDisplayName(profile.displayName);
      parseLocalAge(profile.age);
      const state = readState();
      if (state.userIdByEmail[normalizedEmail]) {
        throw { code: "EMAIL_IN_USE", message: "Email already registered." } as ServiceError;
      }
      const userId = randomId("user");
      const user: LocalUser = {
        id: userId,
        email: normalizedEmail,
        password,
        phoneE164,
        verified: true,
        userType: "registered",
        tier: "free"
      };
      writeState({
        ...state,
        usersById: { ...state.usersById, [userId]: user },
        userIdByEmail: { ...state.userIdByEmail, [normalizedEmail]: userId }
      });
      return { email: normalizedEmail, verificationRequired: true };
    },
    async verifyEmail(email: string, code: string): Promise<VerifyEmailOrLoginResponse> {
      const normalizedEmail = email.trim().toLowerCase();
      const state = readState();
      const userId = state.userIdByEmail[normalizedEmail];
      if (!userId) {
        throw { code: "USER_NOT_FOUND", message: "Account not found." } as ServiceError;
      }
      const expectedCode = state.verificationCodesByEmail[normalizedEmail];
      if (expectedCode && expectedCode !== code.trim()) {
        throw { code: "CODE_INVALID", message: "Invalid verification code." } as ServiceError;
      }
      const user = state.usersById[userId];
      const verifiedUser: LocalUser = { ...user, verified: true };
      const sessionToken = randomId("session");
      const session: Session = {
        sessionToken,
        userType: verifiedUser.userType,
        tier: verifiedUser.tier,
        role: roleForLocalEmail(normalizedEmail),
        mode: "hybrid",
        userId,
        ageVerified: true,
        hybridOptIn: true,
        expiresAtMs: nowMs() + 1000 * 60 * 60 * 24 * 30
      };
      writeState({
        ...state,
        usersById: { ...state.usersById, [userId]: verifiedUser },
        sessionsByToken: { ...state.sessionsByToken, [sessionToken]: session }
      });
      return {
        user: { id: userId, email: normalizedEmail, userType: verifiedUser.userType, tier: verifiedUser.tier },
        jwt: `local-jwt-${sessionToken}`,
        session: clone(session)
      };
    },
    async resendVerification(email: string): Promise<RegisterResponse> {
      const normalizedEmail = email.trim().toLowerCase();
      const state = readState();
      if (!state.userIdByEmail[normalizedEmail]) {
        throw { code: "USER_NOT_FOUND", message: "Account not found." } as ServiceError;
      }
      writeState({
        ...state,
        verificationCodesByEmail: {
          ...state.verificationCodesByEmail,
          [normalizedEmail]: "111111"
        }
      });
      return { email: normalizedEmail, verificationRequired: true };
    },
    async login(email: string, password: string): Promise<VerifyEmailOrLoginResponse> {
      const normalizedEmail = email.trim().toLowerCase();
      const state = readState();
      const userId = state.userIdByEmail[normalizedEmail];
      if (!userId) throw { code: "USER_NOT_FOUND", message: "Invalid credentials." } as ServiceError;
      const user = state.usersById[userId];
      if (!user.verified) throw { code: "NOT_VERIFIED", message: "Verify your email first." } as ServiceError;
      if (user.password !== password) throw { code: "INVALID_CREDENTIALS", message: "Invalid credentials." } as ServiceError;
      const sessionToken = randomId("session");
      const session: Session = {
        sessionToken,
        userType: user.userType,
        tier: user.tier,
        role: roleForLocalEmail(normalizedEmail),
        mode: "hybrid",
        userId,
        ageVerified: true,
        hybridOptIn: true,
        expiresAtMs: nowMs() + 1000 * 60 * 60 * 24 * 30
      };
      writeState({
        ...state,
        sessionsByToken: { ...state.sessionsByToken, [sessionToken]: session }
      });
      return {
        user: { id: userId, email: normalizedEmail, userType: user.userType, tier: user.tier },
        jwt: `local-jwt-${sessionToken}`,
        session: clone(session)
      };
    },
    async verifyAge(sessionToken: string, ageYears: number): Promise<{ session: Session }> {
      if (!Number.isFinite(ageYears) || ageYears < 18) {
        throw { code: "AGE_REJECTED", message: "You must be at least 18." } as ServiceError;
      }
      const state = readState();
      const session = requireSession(state, sessionToken);
      const nextSession: Session = { ...session, ageVerified: true };
      writeState(withUpdatedSession(state, nextSession));
      return { session: clone(nextSession) };
    },
    async getSession(sessionToken: string): Promise<{ session: Session }> {
      const state = readState();
      return { session: clone(requireSession(state, sessionToken)) };
    },
    async getMode(sessionToken: string): Promise<{ mode: Session["mode"] }> {
      const state = readState();
      const session = requireSession(state, sessionToken);
      return { mode: session.mode };
    },
    async setHybridOptIn(sessionToken: string, optIn: boolean): Promise<{ session: Session }> {
      const state = readState();
      const session = requireSession(state, sessionToken);
      const nextMode = optIn ? "hybrid" : session.mode === "hybrid" ? "cruise" : session.mode;
      const nextSession: Session = { ...session, hybridOptIn: optIn, mode: nextMode };
      writeState(withUpdatedSession(state, nextSession));
      return { session: clone(nextSession) };
    },
    async setMode(sessionToken: string, mode: Session["mode"]): Promise<{ session: Session }> {
      const state = readState();
      const session = requireSession(state, sessionToken);
      const nextSession: Session = { ...session, mode };
      writeState(withUpdatedSession(state, nextSession));
      return { session: clone(nextSession) };
    },
    async updatePresence(sessionToken: string, lat: number, lng: number, status?: string): Promise<any> {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw { code: "INVALID_INPUT", message: "Latitude/longitude are required." } as ServiceError;
      }
      const state = readState();
      const session = requireSession(state, sessionToken);
      const key = actorKeyForSession(session);
      const nextPresence: LocalPresence = {
        key,
        userType: session.userType,
        lat,
        lng,
        status,
        updatedAtMs: nowMs()
      };
      writeState(
        {
        ...state,
        presenceByKey: {
          ...state.presenceByKey,
          [key]: nextPresence
        }
      },
        false
      );
      return { ok: true, presence: clone(nextPresence) };
    },
    async listActivePresence(): Promise<{ presence: ReadonlyArray<{ key: string; userType: "guest" | "registered" | "subscriber"; lat: number; lng: number; status?: string; updatedAtMs: number }> }> {
      const state = readState();
      const bannedUserIds = new Set(
        Object.values(state.usersById)
          .filter((user) => typeof (user as { bannedAtMs?: unknown }).bannedAtMs === "number")
          .map((user) => user.id)
      );
      return {
        presence: clone(
          Object.values(state.presenceByKey).filter((presence) => {
            if (!presence.key.startsWith("user:")) return true;
            const userId = presence.key.slice("user:".length).trim();
            return !bannedUserIds.has(userId);
          })
        )
      };
    },
    async getDatingFeed(sessionToken: string): Promise<FeedResponse> {
      const state = readState();
      const session = requireSession(state, sessionToken);
      const meKey = actorKeyForSession(session);
      const mePresence = state.presenceByKey[meKey];
      const profiles = Object.values(state.profilesByUserId)
        .filter((p) => p.userId !== session.userId)
        .map((p) => {
          let row: DatingProfile = {
            id: p.userId,
            displayName: p.displayName,
            age: p.age,
            race: p.stats.race,
            heightInches: p.stats.heightInches,
            weightLbs: p.stats.weightLbs,
            cockSizeInches: p.stats.cockSizeInches,
            cutStatus: p.stats.cutStatus
          };
          const peerPresence = state.presenceByKey[`user:${p.userId}`];
          if (mePresence && peerPresence) {
            row = {
              ...row,
              distanceBucket: toDistanceBucket(distanceMeters(mePresence.lat, mePresence.lng, peerPresence.lat, peerPresence.lng))
            };
          }
          return row;
        });
      return { profiles: clone(profiles) };
    },
    async swipe(sessionToken: string, toUserId: string, direction: "like" | "pass"): Promise<SwipeResponse> {
      const state = readState();
      const session = requireUserSession(state, sessionToken);
      const from = session.userId as string;
      const current = new Set(state.likes[from] ?? []);
      if (direction === "like") current.add(toUserId);
      else current.delete(toUserId);
      const likes = { ...state.likes, [from]: [...current] };
      writeState({ ...state, likes });
      const reciprocal = (likes[toUserId] ?? []).includes(from);
      return reciprocal
        ? { matchCreated: true, match: { matchId: randomId("match"), userA: from, userB: toUserId, createdAtMs: nowMs() } }
        : { matchCreated: false };
    },
    async sendChat(
      sessionToken: string,
      chatKind: "cruise" | "date",
      toKey: string,
      text: string,
      media?: Readonly<{ kind: "image" | "video" | "audio"; objectKey: string; mimeType: string; durationSeconds?: number }>
    ): Promise<any> {
      const state = readState();
      const session = requireSession(state, sessionToken);
      const fromKey = actorKeyForSession(session);
      const normalizedToKey = normalizeChatPeerKey(toKey);
      if (containsDisallowedKidVariation(text)) {
        throw { code: "UNAUTHORIZED_ACTION", message: "Message rejected." } as ServiceError;
      }
      const msg: LocalChatMessage = {
        messageId: randomId("msg"),
        chatKind,
        fromKey,
        toKey: normalizedToKey,
        text,
        media,
        createdAtMs: nowMs(),
        deliveredAtMs: nowMs()
      };
      writeState({ ...state, messages: [...state.messages, msg] });
      return { ok: true, message: clone(msg) };
    },
    async sendCallSignal(): Promise<{ ok: true }> {
      return { ok: true };
    },
    async listChat(sessionToken: string, chatKind: "cruise" | "date", otherKey: string): Promise<any> {
      const state = readState();
      const session = requireSession(state, sessionToken);
      const me = actorKeyForSession(session);
      const peer = normalizeChatPeerKey(otherKey);
      const isSpotThread = chatKind === "cruise" && isCruiseSpotThreadKey(peer);
      const messages = state.messages
        .filter((m) => m.chatKind === chatKind)
        .filter((m) => (isSpotThread ? m.toKey === peer : (m.fromKey === me && m.toKey === peer) || (m.fromKey === peer && m.toKey === me)))
        .sort((a, b) => a.createdAtMs - b.createdAtMs);
      return { messages: clone(messages) };
    },
    async listChatThreads(
      sessionToken: string,
      chatKind: "cruise" | "date"
    ): Promise<{ threads: ReadonlyArray<Readonly<{ otherKey: string; lastMessage: LocalChatMessage }>> }> {
      const state = readState();
      const session = requireSession(state, sessionToken);
      const me = actorKeyForSession(session);
      const latestByPeer = new Map<string, LocalChatMessage>();
      for (const message of state.messages) {
        if (message.chatKind !== chatKind) continue;
        if (chatKind === "cruise" && isCruiseSpotThreadKey(message.toKey)) continue;
        if (message.fromKey !== me && message.toKey !== me) continue;
        const peer = message.fromKey === me ? message.toKey : message.fromKey;
        const current = latestByPeer.get(peer);
        if (!current || message.createdAtMs > current.createdAtMs) {
          latestByPeer.set(peer, message);
        }
      }
      const threads = Array.from(latestByPeer.entries())
        .map(([otherKey, lastMessage]) => ({ otherKey, lastMessage }))
        .sort((a, b) => b.lastMessage.createdAtMs - a.lastMessage.createdAtMs);
      return { threads: clone(threads) };
    },
    async markChatRead(sessionToken: string, chatKind: "cruise" | "date", otherKey: string): Promise<{ readAtMs: number }> {
      const state = readState();
      const session = requireSession(state, sessionToken);
      const me = actorKeyForSession(session);
      const peer = normalizeChatPeerKey(otherKey);
      const isSpotThread = chatKind === "cruise" && isCruiseSpotThreadKey(peer);
      const ts = nowMs();
      const next = state.messages.map((m) => {
        if (m.chatKind !== chatKind) return m;
        if (isSpotThread && m.toKey === peer && m.fromKey !== me && !m.readAtMs) {
          return { ...m, readAtMs: ts };
        }
        if (!isSpotThread && m.fromKey === peer && m.toKey === me && !m.readAtMs) {
          return { ...m, readAtMs: ts };
        }
        return m;
      });
      writeState({ ...state, messages: next });
      return { readAtMs: ts };
    },
    async initiateChatMediaUpload(
      _sessionToken: string,
      payload: Readonly<{ mimeType: string; sizeBytes: number }>
    ): Promise<{ objectKey: string; uploadUrl: string; mimeType: string; expiresInSeconds: number }> {
      if (!Number.isFinite(payload.sizeBytes) || payload.sizeBytes <= 0) {
        throw { code: "INVALID_INPUT", message: "File size must be greater than zero." } as ServiceError;
      }
      const state = readState();
      const objectKey = `chat/${randomId("media")}`;
      const record: LocalChatMediaRecord = {
        objectKey,
        mimeType: payload.mimeType || "application/octet-stream",
        createdAtMs: nowMs()
      };
      writeState({
        ...state,
        chatMediaByObjectKey: {
          ...state.chatMediaByObjectKey,
          [objectKey]: record
        }
      });
      return {
        objectKey,
        uploadUrl: `${LOCAL_UPLOAD_PREFIX}chat/${objectKey}`,
        mimeType: record.mimeType,
        expiresInSeconds: 60 * 10
      };
    },
    async getChatMediaUrl(_sessionToken: string, objectKey: string): Promise<{ objectKey: string; downloadUrl: string; expiresInSeconds: number }> {
      const state = readState();
      const record = state.chatMediaByObjectKey[objectKey];
      if (!record || !record.dataUrl) {
        throw { code: "MEDIA_NOT_FOUND", message: "Chat media not found." } as ServiceError;
      }
      return { objectKey, downloadUrl: record.dataUrl, expiresInSeconds: 60 * 10 };
    },
    async block(sessionToken: string, targetKey: string): Promise<any> {
      const state = readState();
      const session = requireSession(state, sessionToken);
      const actor = actorKeyForSession(session);
      const blocked = new Set(state.blockedByActorKey[actor] ?? []);
      blocked.add(normalizeChatPeerKey(targetKey));
      writeState({
        ...state,
        blockedByActorKey: {
          ...state.blockedByActorKey,
          [actor]: [...blocked]
        }
      });
      return { blocked: [...blocked] };
    },
    async unblock(sessionToken: string, targetKey: string): Promise<any> {
      const state = readState();
      const session = requireSession(state, sessionToken);
      const actor = actorKeyForSession(session);
      const blocked = new Set(state.blockedByActorKey[actor] ?? []);
      blocked.delete(normalizeChatPeerKey(targetKey));
      writeState({
        ...state,
        blockedByActorKey: {
          ...state.blockedByActorKey,
          [actor]: [...blocked]
        }
      });
      return { blocked: [...blocked] };
    },
    async listBlocked(sessionToken: string): Promise<{ blocked: ReadonlyArray<string> }> {
      const state = readState();
      const session = requireSession(state, sessionToken);
      const actor = actorKeyForSession(session);
      return { blocked: clone(state.blockedByActorKey[actor] ?? []) };
    },
    async reportUser(sessionToken: string, targetKey: string, reason: string): Promise<any> {
      const state = readState();
      const session = requireSession(state, sessionToken);
      const actor = actorKeyForSession(session);
      writeState({
        ...state,
        reports: [...state.reports, { type: "user", actorKey: actor, targetKey: normalizeChatPeerKey(targetKey), reason, createdAtMs: nowMs() }]
      });
      return { ok: true };
    },
    async reportMessage(sessionToken: string, messageId: string, reason: string, targetKey?: string): Promise<any> {
      const state = readState();
      const session = requireSession(state, sessionToken);
      const actor = actorKeyForSession(session);
      writeState({
        ...state,
        reports: [...state.reports, { type: "message", actorKey: actor, messageId, targetKey: targetKey ? normalizeChatPeerKey(targetKey) : undefined, reason, createdAtMs: nowMs() }]
      });
      return { ok: true };
    },
    async getMyProfile(sessionToken: string): Promise<{ profile: UserProfile }> {
      const state = readState();
      const session = requireUserSession(state, sessionToken);
      const userId = session.userId as string;
      const profile = state.profilesByUserId[userId];
      if (!profile) throw { code: "PROFILE_NOT_FOUND", message: "Profile not found." } as ServiceError;
      return { profile: clone(profile) };
    },
    async getPublicProfiles(): Promise<{ profiles: ReadonlyArray<PublicProfile> }> {
      const state = readState();
      const bannedUserIds = new Set(
        Object.values(state.usersById)
          .filter((user) => typeof (user as { bannedAtMs?: unknown }).bannedAtMs === "number")
          .map((user) => user.id)
      );
      return {
        profiles: clone(
          Object.values(state.profilesByUserId)
            .filter((profile) => !profile.userId.startsWith("guest:"))
            .filter((profile) => !bannedUserIds.has(profile.userId))
            .map(toPublicProfile)
        )
      };
    },
    async getPublicProfile(userId: string): Promise<{ profile: PublicProfile }> {
      const state = readState();
      if (userId.startsWith("guest:")) throw { code: "PROFILE_NOT_FOUND", message: "Profile not found." } as ServiceError;
      const banned = state.usersById[userId];
      if (banned && typeof (banned as { bannedAtMs?: unknown }).bannedAtMs === "number") {
        throw { code: "PROFILE_NOT_FOUND", message: "Profile not found." } as ServiceError;
      }
      const profile = state.profilesByUserId[userId];
      if (!profile) throw { code: "PROFILE_NOT_FOUND", message: "Profile not found." } as ServiceError;
      return { profile: clone(toPublicProfile(profile)) };
    },
    async getPublicMediaUrl(mediaId: string): Promise<{ downloadUrl: string }> {
      const state = readState();
      return { downloadUrl: resolveMediaDataUrl(state, mediaId) };
    },
    async upsertMyProfile(sessionToken: string, payload: ProfileUpdatePayload): Promise<{ profile: UserProfile }> {
      const state = readState();
      const session = requireUserSession(state, sessionToken);
      const userId = session.userId as string;
      const previous = state.profilesByUserId[userId];
      const next = createProfileFromInput(userId, payload, previous);
      writeState({
        ...state,
        profilesByUserId: {
          ...state.profilesByUserId,
          [userId]: next
        }
      });
      return { profile: clone(next) };
    },
    async updateProfileMediaReferences(
      sessionToken: string,
      payload: Readonly<{
        galleryMediaIds?: ReadonlyArray<string>;
        mainPhotoMediaId?: string;
      }>
    ): Promise<{ profile: UserProfile }> {
      const state = readState();
      const session = requireUserSession(state, sessionToken);
      const userId = session.userId as string;
      const existing = state.profilesByUserId[userId];
      if (!existing) throw { code: "PROFILE_NOT_FOUND", message: "Profile not found." } as ServiceError;
      const next: UserProfile = {
        ...existing,
        galleryMediaIds: payload.galleryMediaIds ? [...payload.galleryMediaIds] : existing.galleryMediaIds,
        mainPhotoMediaId: payload.mainPhotoMediaId !== undefined ? payload.mainPhotoMediaId : existing.mainPhotoMediaId,
        updatedAtMs: nowMs()
      };
      writeState({
        ...state,
        profilesByUserId: {
          ...state.profilesByUserId,
          [userId]: next
        }
      });
      return { profile: clone(next) };
    },
    async initiateMediaUpload(
      sessionToken: string,
      payload: Readonly<{ kind: MediaKind; mimeType: string; sizeBytes: number }>
    ): Promise<InitiateMediaUploadResponse> {
      const state = readState();
      const session = requireUserSession(state, sessionToken);
      const userId = session.userId as string;
      const mediaId = randomId("media");
      const objectKey = `profile/${userId}/${mediaId}`;
      const rec: LocalMediaRecord = {
        mediaId,
        objectKey,
        ownerUserId: userId,
        kind: payload.kind,
        mimeType: payload.mimeType || "application/octet-stream",
        uploaded: false,
        createdAtMs: nowMs()
      };
      writeState({
        ...state,
        mediaById: {
          ...state.mediaById,
          [mediaId]: rec
        },
        mediaIdByObjectKey: {
          ...state.mediaIdByObjectKey,
          [objectKey]: mediaId
        }
      });
      return { mediaId, objectKey, uploadUrl: `${LOCAL_UPLOAD_PREFIX}profile/${objectKey}`, expiresInSeconds: 60 * 10 };
    },
    async completeMediaUpload(sessionToken: string, mediaId: string): Promise<{ media: unknown }> {
      const state = readState();
      const session = requireUserSession(state, sessionToken);
      const userId = session.userId as string;
      const media = state.mediaById[mediaId];
      if (!media || !media.uploaded || !media.dataUrl) {
        throw { code: "MEDIA_UPLOAD_INCOMPLETE", message: "Upload incomplete." } as ServiceError;
      }
      if (media.ownerUserId !== userId) {
        throw { code: "UNAUTHORIZED_ACTION", message: "You cannot modify another user's media." } as ServiceError;
      }
      const existingProfile = state.profilesByUserId[userId];
      if (!existingProfile) throw { code: "PROFILE_NOT_FOUND", message: "Profile not found." } as ServiceError;
      let nextProfile: UserProfile = existingProfile;
      if (media.kind === "photo_main") {
        nextProfile = {
          ...existingProfile,
          mainPhotoMediaId: mediaId,
          updatedAtMs: nowMs()
        };
      } else if (media.kind === "photo_gallery") {
        const hasMedia = existingProfile.galleryMediaIds.includes(mediaId);
        nextProfile = {
          ...existingProfile,
          galleryMediaIds: hasMedia ? existingProfile.galleryMediaIds : [...existingProfile.galleryMediaIds, mediaId],
          updatedAtMs: nowMs()
        };
      } else if (media.kind === "video") {
        nextProfile = {
          ...existingProfile,
          videoMediaId: mediaId,
          updatedAtMs: nowMs()
        };
      }
      writeState({
        ...state,
        profilesByUserId: {
          ...state.profilesByUserId,
          [userId]: nextProfile
        }
      });
      return { media: clone(media) };
    },
    async getFavorites(sessionToken: string): Promise<{ favorites: ReadonlyArray<string> }> {
      const state = readState();
      const session = requireUserSession(state, sessionToken);
      return { favorites: clone(state.favoritesByUserId[session.userId as string] ?? []) };
    },
    async toggleFavorite(sessionToken: string, targetUserId: string): Promise<FavoriteToggleResponse> {
      const state = readState();
      const session = requireUserSession(state, sessionToken);
      const owner = session.userId as string;
      const current = new Set(state.favoritesByUserId[owner] ?? []);
      let isFavorite = false;
      if (current.has(targetUserId)) {
        current.delete(targetUserId);
      } else {
        current.add(targetUserId);
        isFavorite = true;
      }
      const favorites = [...current];
      writeState({
        ...state,
        favoritesByUserId: {
          ...state.favoritesByUserId,
          [owner]: favorites
        }
      });
      return { targetUserId, isFavorite, favorites };
    },
    async listPublicPostings(type?: "ad" | "event", sessionToken?: string): Promise<{ postings: ReadonlyArray<PublicPosting> }> {
      const state = readState();
      let viewerUserId: string | null = null;
      if (typeof sessionToken === "string" && sessionToken.trim().length > 0) {
        try {
          const viewerSession = requireUserSession(state, sessionToken);
          viewerUserId = viewerSession.userId as string;
        } catch {
          viewerUserId = null;
        }
      }
      const now = nowMs();
      const postings = (type ? state.publicPostings.filter((p) => p.type === type) : state.publicPostings).filter((p) => {
        if (p.type === "event") {
          return typeof p.eventStartAtMs !== "number" || p.eventStartAtMs > now;
        }
        if (p.type === "ad") {
          return now - p.createdAtMs < 12 * 60 * 60 * 1000;
        }
        return true;
      });
      const normalized = postings.map((p) => {
        if (p.type !== "event" || !p.locationInstructions) return p;
        const canSeeLocation =
          !!viewerUserId &&
          (p.authorUserId === viewerUserId || (p.acceptedUserIds ?? []).includes(viewerUserId));
        if (canSeeLocation) return p;
        const next = { ...p };
        delete (next as { locationInstructions?: string }).locationInstructions;
        return next;
      });
      return { postings: clone(normalized) };
    },
    async createPublicPosting(
      sessionToken: string,
      payload: Readonly<{
        type: "ad" | "event";
        title: string;
        body: string;
        photoMediaId?: string;
        lat?: number;
        lng?: number;
        eventStartAtMs?: number;
        locationInstructions?: string;
        groupDetails?: string;
      }>
    ): Promise<{ posting: PublicPosting }> {
      const state = readState();
      const session = requireSession(state, sessionToken);
      const photoMediaId = typeof payload.photoMediaId === "string" && payload.photoMediaId.trim().length > 0 ? payload.photoMediaId.trim() : undefined;
      const title = payload.title.trim();
      const body = payload.body.trim();
      const eventStartAtMs =
        typeof payload.eventStartAtMs === "number" && Number.isFinite(payload.eventStartAtMs) && payload.eventStartAtMs > 0
          ? Math.trunc(payload.eventStartAtMs)
          : undefined;
      const lat = typeof payload.lat === "number" && Number.isFinite(payload.lat) ? Number(payload.lat.toFixed(6)) : undefined;
      const lng = typeof payload.lng === "number" && Number.isFinite(payload.lng) ? Number(payload.lng.toFixed(6)) : undefined;
      const locationInstructions =
        typeof payload.locationInstructions === "string" && payload.locationInstructions.trim().length > 0
          ? payload.locationInstructions.trim()
          : undefined;
      const groupDetails = typeof payload.groupDetails === "string" && payload.groupDetails.trim().length > 0 ? payload.groupDetails.trim() : undefined;
      if (payload.type !== "ad" && payload.type !== "event") {
        throw { code: "POSTING_TYPE_NOT_ALLOWED", message: "Invalid posting type." } as ServiceError;
      }
      if (!title) throw { code: "INVALID_INPUT", message: "Title is required." } as ServiceError;
      if (!body) throw { code: "INVALID_INPUT", message: "Body is required." } as ServiceError;
      if (payload.type === "event" && session.userType === "guest") {
        throw { code: "ANONYMOUS_FORBIDDEN", message: "Anonymous users cannot create public postings." } as ServiceError;
      }
      if (payload.type === "event" && session.ageVerified !== true) {
        throw { code: "AGE_GATE_REQUIRED", message: "You must be 18 or older to use Red Door.", context: { minimumAge: 18 } } as ServiceError;
      }
      if (payload.type === "event" && !eventStartAtMs) throw { code: "INVALID_INPUT", message: "Group end date and time are required." } as ServiceError;
      if (payload.type === "event" && (typeof lat !== "number" || typeof lng !== "number")) {
        throw { code: "INVALID_INPUT", message: "Group coordinates are required." } as ServiceError;
      }
      if (payload.type === "event" && !locationInstructions) throw { code: "INVALID_INPUT", message: "Location instructions are required for groups." } as ServiceError;
      if (payload.type === "event" && !groupDetails) throw { code: "INVALID_INPUT", message: "Group details are required." } as ServiceError;
      if (containsDisallowedKidVariation(title)) throw { code: "INVALID_INPUT", message: "Title contains disallowed language." } as ServiceError;
      if (containsDisallowedKidVariation(body)) throw { code: "INVALID_INPUT", message: "Body contains disallowed language." } as ServiceError;
      if (locationInstructions && containsDisallowedKidVariation(locationInstructions)) {
        throw { code: "INVALID_INPUT", message: "Location instructions contain disallowed language." } as ServiceError;
      }
      if (groupDetails && containsDisallowedKidVariation(groupDetails)) {
        throw { code: "INVALID_INPUT", message: "Group details contain disallowed language." } as ServiceError;
      }
      const posting: PublicPosting = {
        postingId: randomId("posting"),
        type: payload.type,
        title,
        body,
        ...(photoMediaId ? { photoMediaId } : {}),
        ...(payload.type === "event" && typeof lat === "number" ? { lat } : {}),
        ...(payload.type === "event" && typeof lng === "number" ? { lng } : {}),
        ...(payload.type === "event" && eventStartAtMs ? { eventStartAtMs } : {}),
        ...(payload.type === "event" && locationInstructions ? { locationInstructions } : {}),
        ...(payload.type === "event" && groupDetails ? { groupDetails } : {}),
        authorUserId: payload.type === "event" ? (session.userId as string) : session.userId ?? `guest:${session.sessionToken}`,
        createdAtMs: nowMs(),
        invitedUserIds: payload.type === "event" ? [] : undefined,
        acceptedUserIds: payload.type === "event" ? [] : undefined,
        joinRequestUserIds: payload.type === "event" ? [] : undefined
      };
      writeState({
        ...state,
        publicPostings: [...state.publicPostings, posting]
      });
      return { posting: clone(posting) };
    },
    async inviteToEvent(
      sessionToken: string,
      payload: Readonly<{ postingId: string; targetUserId: string }>
    ): Promise<{ invite: { postingId: string; invitedUserId: string; invitedByUserId: string; createdAtMs: number } }> {
      const state = readState();
      const session = requireUserSession(state, sessionToken);
      const hostUserId = session.userId as string;
      const idx = state.publicPostings.findIndex((p) => p.postingId === payload.postingId && p.type === "event");
      if (idx < 0) throw { code: "EVENT_NOT_FOUND", message: "Event not found." } as ServiceError;
      const posting = state.publicPostings[idx];
      if (posting.authorUserId !== hostUserId) {
        throw { code: "UNAUTHORIZED_ACTION", message: "Only the event host can invite users." } as ServiceError;
      }
      const invited = new Set(posting.invitedUserIds ?? []);
      invited.add(payload.targetUserId);
      const updated: PublicPosting = { ...posting, invitedUserIds: [...invited].sort() };
      const next = [...state.publicPostings];
      next[idx] = updated;
      writeState({ ...state, publicPostings: next });
      return { invite: { postingId: payload.postingId, invitedUserId: payload.targetUserId, invitedByUserId: hostUserId, createdAtMs: nowMs() } };
    },
    async respondToEventInvite(sessionToken: string, payload: Readonly<{ postingId: string; accept: boolean }>): Promise<{ posting: PublicPosting }> {
      const state = readState();
      const session = requireUserSession(state, sessionToken);
      const userId = session.userId as string;
      const idx = state.publicPostings.findIndex((p) => p.postingId === payload.postingId && p.type === "event");
      if (idx < 0) throw { code: "EVENT_NOT_FOUND", message: "Event not found." } as ServiceError;
      const posting = state.publicPostings[idx];
      const invited = new Set(posting.invitedUserIds ?? []);
      if (!invited.has(userId)) throw { code: "UNAUTHORIZED_ACTION", message: "You are not invited to this event." } as ServiceError;
      const accepted = new Set(posting.acceptedUserIds ?? []);
      if (payload.accept) accepted.add(userId);
      else accepted.delete(userId);
      const updated: PublicPosting = { ...posting, acceptedUserIds: [...accepted].sort() };
      const next = [...state.publicPostings];
      next[idx] = updated;
      writeState({ ...state, publicPostings: next });
      return { posting: clone(updated) };
    },
    async requestToJoinEvent(sessionToken: string, payload: Readonly<{ postingId: string }>): Promise<{ posting: PublicPosting }> {
      const state = readState();
      const session = requireUserSession(state, sessionToken);
      const userId = session.userId as string;
      const idx = state.publicPostings.findIndex((p) => p.postingId === payload.postingId && p.type === "event");
      if (idx < 0) throw { code: "EVENT_NOT_FOUND", message: "Event not found." } as ServiceError;
      const posting = state.publicPostings[idx];
      if (posting.authorUserId === userId) throw { code: "INVALID_INPUT", message: "Host is already attending." } as ServiceError;
      if ((posting.acceptedUserIds ?? []).includes(userId)) throw { code: "INVALID_INPUT", message: "You are already marked attending." } as ServiceError;
      const requests = new Set(posting.joinRequestUserIds ?? []);
      if (requests.has(userId)) throw { code: "INVALID_INPUT", message: "Join request already sent." } as ServiceError;
      requests.add(userId);
      const updated: PublicPosting = { ...posting, joinRequestUserIds: [...requests].sort() };
      const next = [...state.publicPostings];
      next[idx] = updated;
      writeState({ ...state, publicPostings: next });
      return { posting: clone(updated) };
    },
    async respondToEventJoinRequest(
      sessionToken: string,
      payload: Readonly<{ postingId: string; targetUserId: string; accept: boolean }>
    ): Promise<{ posting: PublicPosting }> {
      const state = readState();
      const session = requireUserSession(state, sessionToken);
      const hostUserId = session.userId as string;
      const idx = state.publicPostings.findIndex((p) => p.postingId === payload.postingId && p.type === "event");
      if (idx < 0) throw { code: "EVENT_NOT_FOUND", message: "Event not found." } as ServiceError;
      const posting = state.publicPostings[idx];
      if (posting.authorUserId !== hostUserId) {
        throw { code: "UNAUTHORIZED_ACTION", message: "Only the event host can respond to join requests." } as ServiceError;
      }
      const requests = new Set(posting.joinRequestUserIds ?? []);
      if (!requests.has(payload.targetUserId)) {
        throw { code: "INVALID_INPUT", message: "No pending join request for this user." } as ServiceError;
      }
      requests.delete(payload.targetUserId);
      const invited = new Set(posting.invitedUserIds ?? []);
      const accepted = new Set(posting.acceptedUserIds ?? []);
      if (payload.accept) {
        invited.add(payload.targetUserId);
        accepted.add(payload.targetUserId);
      } else {
        invited.delete(payload.targetUserId);
        accepted.delete(payload.targetUserId);
      }
      const updated: PublicPosting = {
        ...posting,
        joinRequestUserIds: [...requests].sort(),
        invitedUserIds: [...invited].sort(),
        acceptedUserIds: [...accepted].sort()
      };
      const next = [...state.publicPostings];
      next[idx] = updated;
      writeState({ ...state, publicPostings: next });
      return { posting: clone(updated) };
    },
    async listEventInvites(sessionToken: string): Promise<{ postings: ReadonlyArray<PublicPosting> }> {
      const state = readState();
      const session = requireUserSession(state, sessionToken);
      const userId = session.userId as string;
      const postings = state.publicPostings.filter((p) => p.type === "event" && (p.invitedUserIds ?? []).includes(userId));
      return { postings: clone(postings) };
    },
    async listCruisingSpots(_sessionToken?: string): Promise<{ spots: ReadonlyArray<CruisingSpot> }> {
      const state = readState();
      return { spots: clone(state.cruisingSpots) };
    },
    async createCruisingSpot(
      sessionToken: string,
      payload: Readonly<{ name: string; address: string; description: string; photoMediaId?: string }>
    ): Promise<{ spot: CruisingSpot }> {
      const state = readState();
      const session = requireSession(state, sessionToken);
      const actorKey = actorKeyForSession(session);
      const existingPresence = state.presenceByKey[actorKey];
      const photoMediaId = typeof payload.photoMediaId === "string" && payload.photoMediaId.trim().length > 0 ? payload.photoMediaId.trim() : undefined;
      const name = payload.name.trim();
      const address = payload.address.trim();
      const description = payload.description.trim();
      if (containsDisallowedKidVariation(name)) throw { code: "INVALID_INPUT", message: "Spot name contains disallowed language." } as ServiceError;
      if (containsDisallowedKidVariation(address)) throw { code: "INVALID_INPUT", message: "Spot address contains disallowed language." } as ServiceError;
      if (containsDisallowedKidVariation(description)) {
        throw { code: "INVALID_INPUT", message: "Spot description contains disallowed language." } as ServiceError;
      }
      const spot: CruisingSpot = {
        spotId: randomId("spot"),
        name,
        address,
        lat: existingPresence?.lat ?? 0,
        lng: existingPresence?.lng ?? 0,
        description,
        ...(photoMediaId ? { photoMediaId } : {}),
        creatorUserId: session.userId ?? actorKey,
        createdAtMs: nowMs(),
        checkInCount: 0,
        actionCount: 0
      };
      writeState({
        ...state,
        cruisingSpots: [...state.cruisingSpots, spot]
      });
      return { spot: clone(spot) };
    },
    async checkInCruisingSpot(sessionToken: string, spotId: string): Promise<{ checkIn: { spotId: string; actorKey: string; checkedInAtMs: number } }> {
      const state = readState();
      const session = requireSession(state, sessionToken);
      const actorKey = actorKeyForSession(session);
      const ts = nowMs();
      const checkIn = { spotId, actorKey, checkedInAtMs: ts };
      const checkIns = [...state.spotCheckIns, checkIn];
      const spots = state.cruisingSpots.map((spot) => (spot.spotId === spotId ? { ...spot, checkInCount: (spot.checkInCount ?? 0) + 1 } : spot));
      writeState({
        ...state,
        spotCheckIns: checkIns,
        cruisingSpots: spots
      });
      return { checkIn };
    },
    async markCruisingSpotAction(sessionToken: string, spotId: string): Promise<{ action: { spotId: string; actorKey: string; markedAtMs: number } }> {
      const state = readState();
      const session = requireSession(state, sessionToken);
      const actorKey = actorKeyForSession(session);
      const action = { spotId, actorKey, markedAtMs: nowMs() };
      const spots = state.cruisingSpots.map((spot) => (spot.spotId === spotId ? { ...spot, actionCount: (spot.actionCount ?? 0) + 1 } : spot));
      writeState({
        ...state,
        spotActions: [...state.spotActions, action],
        cruisingSpots: spots
      });
      return { action };
    },
    async listCruisingSpotCheckIns(spotId: string): Promise<{ checkIns: ReadonlyArray<{ spotId: string; actorKey: string; checkedInAtMs: number }> }> {
      const state = readState();
      return { checkIns: clone(state.spotCheckIns.filter((x) => x.spotId === spotId)) };
    },
    async listSubmissions(): Promise<{ submissions: ReadonlyArray<Submission> }> {
      const state = readState();
      return { submissions: clone(state.submissions) };
    },
    async createSubmission(sessionToken: string, payload: Readonly<{ title: string; body: string }>): Promise<{ submission: Submission }> {
      const state = readState();
      const session = requireSession(state, sessionToken);
      const title = payload.title.trim();
      const body = payload.body.trim();
      if (containsDisallowedKidVariation(title)) throw { code: "INVALID_INPUT", message: "Title contains disallowed language." } as ServiceError;
      if (containsDisallowedKidVariation(body)) throw { code: "INVALID_INPUT", message: "Body contains disallowed language." } as ServiceError;
      const submission: Submission = {
        submissionId: randomId("submission"),
        authorUserId: session.userId ?? actorKeyForSession(session),
        title,
        body,
        viewCount: 0,
        ratingCount: 0,
        ratingSum: 0,
        createdAtMs: nowMs()
      };
      writeState({
        ...state,
        submissions: [...state.submissions, submission]
      });
      return { submission: clone(submission) };
    },
    async recordSubmissionView(submissionId: string): Promise<{ submission: Submission }> {
      const state = readState();
      const idx = state.submissions.findIndex((s) => s.submissionId === submissionId);
      if (idx < 0) throw { code: "SUBMISSION_NOT_FOUND", message: "Submission not found." } as ServiceError;
      const current = state.submissions[idx];
      const updated: Submission = { ...current, viewCount: current.viewCount + 1 };
      const next = [...state.submissions];
      next[idx] = updated;
      writeState({ ...state, submissions: next });
      return { submission: clone(updated) };
    },
    async rateSubmission(submissionId: string, stars: number): Promise<{ submission: Submission }> {
      const state = readState();
      const idx = state.submissions.findIndex((s) => s.submissionId === submissionId);
      if (idx < 0) throw { code: "SUBMISSION_NOT_FOUND", message: "Submission not found." } as ServiceError;
      const bounded = Math.max(1, Math.min(5, Math.round(stars)));
      const current = state.submissions[idx];
      const updated: Submission = {
        ...current,
        ratingCount: current.ratingCount + 1,
        ratingSum: current.ratingSum + bounded
      };
      const next = [...state.submissions];
      next[idx] = updated;
      writeState({ ...state, submissions: next });
      return { submission: clone(updated) };
    },
    async adminListUsers(sessionToken: string): Promise<{ users: ReadonlyArray<AdminUserSummary> }> {
      const state = readState();
      requireAdminSession(state, sessionToken);
      const users = Object.values(state.usersById)
        .map<AdminUserSummary>((user) => ({
          id: user.id,
          email: user.email,
          userType: user.userType,
          tier: user.tier,
          role: roleForLocalEmail(user.email),
          ageVerified: true,
          emailVerified: user.verified === true,
          bannedAtMs: null,
          bannedReason: null,
          createdAtMs: nowMs()
        }))
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      return { users: clone(users) };
    },
    async adminBanUser(sessionToken: string, userId: string, reason?: string): Promise<{ user: Pick<AdminUserSummary, "id" | "bannedAtMs" | "bannedReason"> }> {
      const state = readState();
      requireAdminSession(state, sessionToken);
      const user = state.usersById[userId];
      if (!user) throw { code: "USER_NOT_FOUND", message: "User not found." } as ServiceError;
      const ts = nowMs();
      const nextSessionsByToken = Object.fromEntries(
        Object.entries(state.sessionsByToken).filter(([, session]) => session.userId !== userId)
      );
      writeState({ ...state, sessionsByToken: nextSessionsByToken });
      return { user: { id: userId, bannedAtMs: ts, bannedReason: reason?.trim() || null } };
    },
    async adminUnbanUser(sessionToken: string, userId: string): Promise<{ user: Pick<AdminUserSummary, "id" | "bannedAtMs" | "bannedReason"> }> {
      const state = readState();
      requireAdminSession(state, sessionToken);
      if (!state.usersById[userId]) throw { code: "USER_NOT_FOUND", message: "User not found." } as ServiceError;
      return { user: { id: userId, bannedAtMs: null, bannedReason: null } };
    },
    async adminListCruisingSpots(sessionToken: string): Promise<{ spots: ReadonlyArray<CruisingSpot> }> {
      const state = readState();
      requireAdminSession(state, sessionToken);
      return { spots: clone(state.cruisingSpots) };
    },
    async adminApproveCruisingSpot(sessionToken: string, spotId: string): Promise<{ spot: CruisingSpot }> {
      const state = readState();
      requireAdminSession(state, sessionToken);
      const idx = state.cruisingSpots.findIndex((spot) => spot.spotId === spotId);
      if (idx < 0) throw { code: "SPOT_NOT_FOUND", message: "Cruising spot not found." } as ServiceError;
      const updated = { ...state.cruisingSpots[idx], moderationStatus: "approved" as const };
      const next = [...state.cruisingSpots];
      next[idx] = updated;
      writeState({ ...state, cruisingSpots: next });
      return { spot: clone(updated) };
    },
    async adminRejectCruisingSpot(sessionToken: string, spotId: string): Promise<{ spot: CruisingSpot }> {
      const state = readState();
      requireAdminSession(state, sessionToken);
      const idx = state.cruisingSpots.findIndex((spot) => spot.spotId === spotId);
      if (idx < 0) throw { code: "SPOT_NOT_FOUND", message: "Cruising spot not found." } as ServiceError;
      const updated = { ...state.cruisingSpots[idx], moderationStatus: "rejected" as const };
      const next = [...state.cruisingSpots];
      next[idx] = updated;
      writeState({ ...state, cruisingSpots: next });
      return { spot: clone(updated) };
    },
    async adminDeleteCruisingSpot(sessionToken: string, spotId: string): Promise<{ spotId: string }> {
      const state = readState();
      requireAdminSession(state, sessionToken);
      if (PERMANENT_CRUISING_SPOT_IDS.has(spotId)) {
        throw { code: "INVALID_INPUT", message: "Built-in cruising spots cannot be removed." } as ServiceError;
      }
      const next = state.cruisingSpots.filter((spot) => spot.spotId !== spotId);
      writeState({ ...state, cruisingSpots: next });
      return { spotId };
    },
    async adminListPublicPostings(sessionToken: string, type?: "ad" | "event"): Promise<{ postings: ReadonlyArray<PublicPosting> }> {
      const state = readState();
      requireAdminSession(state, sessionToken);
      const postings = type ? state.publicPostings.filter((posting) => posting.type === type) : state.publicPostings;
      return { postings: clone(postings) };
    },
    async adminApprovePublicPosting(sessionToken: string, postingId: string): Promise<{ posting: PublicPosting }> {
      const state = readState();
      requireAdminSession(state, sessionToken);
      const idx = state.publicPostings.findIndex((posting) => posting.postingId === postingId);
      if (idx < 0) throw { code: "POSTING_NOT_FOUND", message: "Posting not found." } as ServiceError;
      const updated = { ...state.publicPostings[idx], moderationStatus: "approved" as const };
      const next = [...state.publicPostings];
      next[idx] = updated;
      writeState({ ...state, publicPostings: next });
      return { posting: clone(updated) };
    },
    async adminRejectPublicPosting(sessionToken: string, postingId: string): Promise<{ posting: PublicPosting }> {
      const state = readState();
      requireAdminSession(state, sessionToken);
      const idx = state.publicPostings.findIndex((posting) => posting.postingId === postingId);
      if (idx < 0) throw { code: "POSTING_NOT_FOUND", message: "Posting not found." } as ServiceError;
      const updated = { ...state.publicPostings[idx], moderationStatus: "rejected" as const };
      const next = [...state.publicPostings];
      next[idx] = updated;
      writeState({ ...state, publicPostings: next });
      return { posting: clone(updated) };
    },
    async adminDeletePublicPosting(sessionToken: string, postingId: string): Promise<{ postingId: string }> {
      const state = readState();
      requireAdminSession(state, sessionToken);
      const next = state.publicPostings.filter((posting) => posting.postingId !== postingId);
      writeState({ ...state, publicPostings: next });
      return { postingId };
    },
    async adminListSubmissions(sessionToken: string): Promise<{ submissions: ReadonlyArray<Submission> }> {
      const state = readState();
      requireAdminSession(state, sessionToken);
      return { submissions: clone(state.submissions) };
    },
    async adminApproveSubmission(sessionToken: string, submissionId: string): Promise<{ submission: Submission }> {
      const state = readState();
      requireAdminSession(state, sessionToken);
      const idx = state.submissions.findIndex((submission) => submission.submissionId === submissionId);
      if (idx < 0) throw { code: "SUBMISSION_NOT_FOUND", message: "Submission not found." } as ServiceError;
      const updated = { ...state.submissions[idx], moderationStatus: "approved" as const };
      const next = [...state.submissions];
      next[idx] = updated;
      writeState({ ...state, submissions: next });
      return { submission: clone(updated) };
    },
    async adminRejectSubmission(sessionToken: string, submissionId: string): Promise<{ submission: Submission }> {
      const state = readState();
      requireAdminSession(state, sessionToken);
      const idx = state.submissions.findIndex((submission) => submission.submissionId === submissionId);
      if (idx < 0) throw { code: "SUBMISSION_NOT_FOUND", message: "Submission not found." } as ServiceError;
      const updated = { ...state.submissions[idx], moderationStatus: "rejected" as const };
      const next = [...state.submissions];
      next[idx] = updated;
      writeState({ ...state, submissions: next });
      return { submission: clone(updated) };
    },
    async adminDeleteSubmission(sessionToken: string, submissionId: string): Promise<{ submissionId: string }> {
      const state = readState();
      requireAdminSession(state, sessionToken);
      const next = state.submissions.filter((submission) => submission.submissionId !== submissionId);
      writeState({ ...state, submissions: next });
      return { submissionId };
    },
    async listPromotedProfiles(): Promise<{ listings: ReadonlyArray<PromotedProfileListing>; feeCents: number }> {
      const state = readState();
      return { listings: clone(state.promotedProfiles), feeCents };
    },
    async startPromotedPayment(
      sessionToken: string
    ): Promise<{ payment: { paymentToken: string; amountCents: number; status: string; expiresAtMs: number } }> {
      const state = readState();
      const session = requireUserSession(state, sessionToken);
      const token = randomId("payment");
      const payment = {
        paymentToken: token,
        ownerUserId: session.userId as string,
        amountCents: feeCents,
        status: "started" as const,
        expiresAtMs: nowMs() + 1000 * 60 * 20
      };
      writeState({
        ...state,
        promotedPaymentsByToken: {
          ...state.promotedPaymentsByToken,
          [token]: payment
        }
      });
      return { payment: { paymentToken: token, amountCents: payment.amountCents, status: payment.status, expiresAtMs: payment.expiresAtMs } };
    },
    async confirmPromotedPayment(
      sessionToken: string,
      paymentToken: string
    ): Promise<{ payment: { paymentToken: string; amountCents: number; status: string; expiresAtMs: number } }> {
      const state = readState();
      const session = requireUserSession(state, sessionToken);
      const payment = state.promotedPaymentsByToken[paymentToken];
      if (!payment || payment.ownerUserId !== session.userId) {
        throw { code: "PAYMENT_NOT_FOUND", message: "Payment not found." } as ServiceError;
      }
      const updated = { ...payment, status: "confirmed" as const };
      writeState({
        ...state,
        promotedPaymentsByToken: {
          ...state.promotedPaymentsByToken,
          [paymentToken]: updated
        }
      });
      return { payment: { paymentToken, amountCents: updated.amountCents, status: updated.status, expiresAtMs: updated.expiresAtMs } };
    },
    async createPromotedProfile(
      sessionToken: string,
      payload: Readonly<{ paymentToken: string; title: string; body: string; displayName: string }>
    ): Promise<{ listing: PromotedProfileListing }> {
      const state = readState();
      const session = requireUserSession(state, sessionToken);
      const payment = state.promotedPaymentsByToken[payload.paymentToken];
      if (!payment || payment.ownerUserId !== session.userId || payment.status !== "confirmed") {
        throw { code: "PAYMENT_REQUIRED", message: "Confirm payment before creating a promoted profile." } as ServiceError;
      }
      const title = payload.title.trim();
      const body = payload.body.trim();
      const displayName = payload.displayName.trim();
      if (containsDisallowedKidVariation(title)) throw { code: "INVALID_INPUT", message: "Title contains disallowed language." } as ServiceError;
      if (containsDisallowedKidVariation(body)) throw { code: "INVALID_INPUT", message: "Body contains disallowed language." } as ServiceError;
      if (containsDisallowedKidVariation(displayName)) {
        throw { code: "INVALID_INPUT", message: "Display name contains disallowed language." } as ServiceError;
      }
      const listing: PromotedProfileListing = {
        listingId: randomId("listing"),
        userId: session.userId as string,
        title,
        body,
        displayName,
        createdAtMs: nowMs()
      };
      writeState({
        ...state,
        promotedProfiles: [...state.promotedProfiles, listing]
      });
      return { listing: clone(listing) };
    }
  };
}

export function apiClient(basePath = "/api"): Readonly<{
  createGuest(): Promise<GuestResponse>;
  register(email: string, password: string, phoneE164: string, profile: RegistrationProfileInput): Promise<RegisterResponse>;
  verifyEmail(email: string, code: string): Promise<VerifyEmailOrLoginResponse>;
  resendVerification(email: string): Promise<RegisterResponse>;
  login(email: string, password: string): Promise<VerifyEmailOrLoginResponse>;
  verifyAge(sessionToken: string, ageYears: number): Promise<{ session: Session }>;
  getSession(sessionToken: string): Promise<{ session: Session }>;
  getMode(sessionToken: string): Promise<{ mode: Session["mode"] }>;
  setHybridOptIn(sessionToken: string, optIn: boolean): Promise<{ session: Session }>;
  setMode(sessionToken: string, mode: Session["mode"]): Promise<{ session: Session }>;
  updatePresence(sessionToken: string, lat: number, lng: number, status?: string): Promise<any>;
  listActivePresence(sessionToken: string): Promise<{ presence: ReadonlyArray<{ key: string; userType: "guest" | "registered" | "subscriber"; lat: number; lng: number; status?: string; updatedAtMs: number }> }>;
  getDatingFeed(sessionToken: string): Promise<FeedResponse>;
  swipe(sessionToken: string, toUserId: string, direction: "like" | "pass"): Promise<SwipeResponse>;
  sendChat(
    sessionToken: string,
    chatKind: "cruise" | "date",
    toKey: string,
    text: string,
    media?: Readonly<{ kind: "image" | "video" | "audio"; objectKey: string; mimeType: string; durationSeconds?: number }>
  ): Promise<any>;
  sendCallSignal(
    sessionToken: string,
    payload: Readonly<{
      toKey: string;
      callId: string;
      signalType: "offer" | "answer" | "ice" | "hangup";
      sdp?: string;
      candidate?: string;
    }>
  ): Promise<{ ok: true }>;
  listChat(sessionToken: string, chatKind: "cruise" | "date", otherKey: string): Promise<any>;
  listChatThreads(
    sessionToken: string,
    chatKind: "cruise" | "date"
  ): Promise<{ threads: ReadonlyArray<Readonly<{ otherKey: string; lastMessage: LocalChatMessage }>> }>;
  markChatRead(sessionToken: string, chatKind: "cruise" | "date", otherKey: string): Promise<{ readAtMs: number }>;
  initiateChatMediaUpload(
    sessionToken: string,
    payload: Readonly<{ mimeType: string; sizeBytes: number }>
  ): Promise<{ objectKey: string; uploadUrl: string; mimeType: string; expiresInSeconds: number }>;
  getChatMediaUrl(sessionToken: string, objectKey: string): Promise<{ objectKey: string; downloadUrl: string; expiresInSeconds: number }>;
  block(sessionToken: string, targetKey: string): Promise<any>;
  unblock(sessionToken: string, targetKey: string): Promise<any>;
  listBlocked(sessionToken: string): Promise<{ blocked: ReadonlyArray<string> }>;
  reportUser(sessionToken: string, targetKey: string, reason: string): Promise<any>;
  reportMessage(sessionToken: string, messageId: string, reason: string, targetKey?: string): Promise<any>;
  getMyProfile(sessionToken: string): Promise<{ profile: UserProfile }>;
  getPublicProfiles(): Promise<{ profiles: ReadonlyArray<PublicProfile> }>;
  getPublicProfile(userId: string): Promise<{ profile: PublicProfile }>;
  getPublicMediaUrl(mediaId: string): Promise<{ downloadUrl: string }>;
  upsertMyProfile(sessionToken: string, payload: ProfileUpdatePayload): Promise<{ profile: UserProfile }>;
  updateProfileMediaReferences(
    sessionToken: string,
    payload: Readonly<{
      galleryMediaIds?: ReadonlyArray<string>;
      mainPhotoMediaId?: string;
    }>
  ): Promise<{ profile: UserProfile }>;
  initiateMediaUpload(
    sessionToken: string,
    payload: Readonly<{ kind: MediaKind; mimeType: string; sizeBytes: number }>
  ): Promise<InitiateMediaUploadResponse>;
  completeMediaUpload(sessionToken: string, mediaId: string): Promise<{ media: unknown }>;
  getFavorites(sessionToken: string): Promise<{ favorites: ReadonlyArray<string> }>;
  toggleFavorite(sessionToken: string, targetUserId: string): Promise<FavoriteToggleResponse>;
  listPublicPostings(type?: "ad" | "event", sessionToken?: string): Promise<{ postings: ReadonlyArray<PublicPosting> }>;
  createPublicPosting(
    sessionToken: string,
    payload: Readonly<{
      type: "ad" | "event";
      title: string;
      body: string;
      photoMediaId?: string;
      lat?: number;
      lng?: number;
      eventStartAtMs?: number;
      locationInstructions?: string;
      groupDetails?: string;
    }>
  ): Promise<{ posting: PublicPosting }>;
  inviteToEvent(
    sessionToken: string,
    payload: Readonly<{ postingId: string; targetUserId: string }>
  ): Promise<{ invite: { postingId: string; invitedUserId: string; invitedByUserId: string; createdAtMs: number } }>;
  respondToEventInvite(sessionToken: string, payload: Readonly<{ postingId: string; accept: boolean }>): Promise<{ posting: PublicPosting }>;
  requestToJoinEvent(sessionToken: string, payload: Readonly<{ postingId: string }>): Promise<{ posting: PublicPosting }>;
  respondToEventJoinRequest(
    sessionToken: string,
    payload: Readonly<{ postingId: string; targetUserId: string; accept: boolean }>
  ): Promise<{ posting: PublicPosting }>;
  listEventInvites(sessionToken: string): Promise<{ postings: ReadonlyArray<PublicPosting> }>;
  listCruisingSpots(sessionToken?: string): Promise<{ spots: ReadonlyArray<CruisingSpot> }>;
  createCruisingSpot(
    sessionToken: string,
    payload: Readonly<{ name: string; address: string; description: string; photoMediaId?: string }>
  ): Promise<{ spot: CruisingSpot }>;
  checkInCruisingSpot(sessionToken: string, spotId: string): Promise<{ checkIn: { spotId: string; actorKey: string; checkedInAtMs: number } }>;
  markCruisingSpotAction(sessionToken: string, spotId: string): Promise<{ action: { spotId: string; actorKey: string; markedAtMs: number } }>;
  listCruisingSpotCheckIns(spotId: string): Promise<{ checkIns: ReadonlyArray<{ spotId: string; actorKey: string; checkedInAtMs: number }> }>;
  listSubmissions(): Promise<{ submissions: ReadonlyArray<Submission> }>;
  createSubmission(sessionToken: string, payload: Readonly<{ title: string; body: string }>): Promise<{ submission: Submission }>;
  recordSubmissionView(submissionId: string): Promise<{ submission: Submission }>;
  rateSubmission(submissionId: string, stars: number): Promise<{ submission: Submission }>;
  adminListUsers(sessionToken: string): Promise<{ users: ReadonlyArray<AdminUserSummary> }>;
  adminBanUser(sessionToken: string, userId: string, reason?: string): Promise<{ user: Pick<AdminUserSummary, "id" | "bannedAtMs" | "bannedReason"> }>;
  adminUnbanUser(sessionToken: string, userId: string): Promise<{ user: Pick<AdminUserSummary, "id" | "bannedAtMs" | "bannedReason"> }>;
  adminListCruisingSpots(sessionToken: string): Promise<{ spots: ReadonlyArray<CruisingSpot> }>;
  adminApproveCruisingSpot(sessionToken: string, spotId: string, reason?: string): Promise<{ spot: CruisingSpot }>;
  adminRejectCruisingSpot(sessionToken: string, spotId: string, reason?: string): Promise<{ spot: CruisingSpot }>;
  adminDeleteCruisingSpot(sessionToken: string, spotId: string): Promise<{ spotId: string }>;
  adminListPublicPostings(sessionToken: string, type?: "ad" | "event"): Promise<{ postings: ReadonlyArray<PublicPosting> }>;
  adminApprovePublicPosting(sessionToken: string, postingId: string, reason?: string): Promise<{ posting: PublicPosting }>;
  adminRejectPublicPosting(sessionToken: string, postingId: string, reason?: string): Promise<{ posting: PublicPosting }>;
  adminDeletePublicPosting(sessionToken: string, postingId: string): Promise<{ postingId: string }>;
  adminListSubmissions(sessionToken: string): Promise<{ submissions: ReadonlyArray<Submission> }>;
  adminApproveSubmission(sessionToken: string, submissionId: string, reason?: string): Promise<{ submission: Submission }>;
  adminRejectSubmission(sessionToken: string, submissionId: string, reason?: string): Promise<{ submission: Submission }>;
  adminDeleteSubmission(sessionToken: string, submissionId: string): Promise<{ submissionId: string }>;
  listPromotedProfiles(): Promise<{ listings: ReadonlyArray<PromotedProfileListing>; feeCents: number }>;
  startPromotedPayment(sessionToken: string): Promise<{ payment: { paymentToken: string; amountCents: number; status: string; expiresAtMs: number } }>;
  confirmPromotedPayment(
    sessionToken: string,
    paymentToken: string
  ): Promise<{ payment: { paymentToken: string; amountCents: number; status: string; expiresAtMs: number } }>;
  createPromotedProfile(
    sessionToken: string,
    payload: Readonly<{ paymentToken: string; title: string; body: string; displayName: string }>
  ): Promise<{ listing: PromotedProfileListing }>;
}> {
  if (isLocalApiMode(basePath)) {
    return createLocalApiClient();
  }

  function headers(sessionToken?: string): HeadersInit {
    const h: Record<string, string> = { "content-type": "application/json" };
    if (sessionToken) h["x-session-token"] = sessionToken;
    return h;
  }

  return {
    async createGuest(): Promise<GuestResponse> {
      const res = await fetch(`${basePath}/auth/guest`, { method: "POST" });
      return (await readJsonOrThrow(res)) as GuestResponse;
    },
    async register(email: string, password: string, phoneE164: string, profile: RegistrationProfileInput): Promise<RegisterResponse> {
      const res = await fetch(`${basePath}/auth/register`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ email, password, phoneE164, displayName: profile.displayName, age: profile.age, stats: profile.stats ?? {} })
      });
      return (await readJsonOrThrow(res)) as RegisterResponse;
    },
    async verifyEmail(email: string, code: string): Promise<VerifyEmailOrLoginResponse> {
      const res = await fetch(`${basePath}/auth/verify-email`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ email, code })
      });
      return (await readJsonOrThrow(res)) as VerifyEmailOrLoginResponse;
    },
    async resendVerification(email: string): Promise<RegisterResponse> {
      const res = await fetch(`${basePath}/auth/resend-verification`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ email })
      });
      return (await readJsonOrThrow(res)) as RegisterResponse;
    },
    async login(email: string, password: string): Promise<VerifyEmailOrLoginResponse> {
      const res = await fetch(`${basePath}/auth/login`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ email, password })
      });
      return (await readJsonOrThrow(res)) as VerifyEmailOrLoginResponse;
    },
    async verifyAge(sessionToken: string, ageYears: number): Promise<{ session: Session }> {
      const res = await fetch(`${basePath}/auth/verify-age`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ sessionToken, ageYears })
      });
      return (await readJsonOrThrow(res)) as { session: Session };
    },
    async getSession(sessionToken: string): Promise<{ session: Session }> {
      const res = await fetch(`${basePath}/session`, { method: "GET", headers: headers(sessionToken) });
      return (await readJsonOrThrow(res)) as { session: Session };
    },
    async getMode(sessionToken: string): Promise<{ mode: Session["mode"] }> {
      const res = await fetch(`${basePath}/mode`, { method: "GET", headers: headers(sessionToken) });
      return (await readJsonOrThrow(res)) as { mode: Session["mode"] };
    },
    async setHybridOptIn(sessionToken: string, optIn: boolean): Promise<{ session: Session }> {
      const res = await fetch(`${basePath}/mode/hybrid-opt-in`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify({ optIn })
      });
      return (await readJsonOrThrow(res)) as { session: Session };
    },
    async setMode(sessionToken: string, mode: Session["mode"]): Promise<{ session: Session }> {
      const res = await fetch(`${basePath}/mode`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify({ mode })
      });
      return (await readJsonOrThrow(res)) as { session: Session };
    },
    async updatePresence(sessionToken: string, lat: number, lng: number, status?: string): Promise<any> {
      const res = await fetch(`${basePath}/presence`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify({ lat, lng, status })
      });
      return readJsonOrThrow(res);
    },
    async listActivePresence(
      sessionToken: string
    ): Promise<{ presence: ReadonlyArray<{ key: string; userType: "guest" | "registered" | "subscriber"; lat: number; lng: number; status?: string; updatedAtMs: number }> }> {
      const res = await fetch(`${basePath}/presence/active`, { method: "GET", headers: headers(sessionToken) });
      return (await readJsonOrThrow(res)) as {
        presence: ReadonlyArray<{ key: string; userType: "guest" | "registered" | "subscriber"; lat: number; lng: number; status?: string; updatedAtMs: number }>;
      };
    },
    async getDatingFeed(sessionToken: string): Promise<FeedResponse> {
      const res = await fetch(`${basePath}/dating/feed`, { method: "GET", headers: headers(sessionToken) });
      return (await readJsonOrThrow(res)) as FeedResponse;
    },
    async swipe(sessionToken: string, toUserId: string, direction: "like" | "pass"): Promise<SwipeResponse> {
      const res = await fetch(`${basePath}/matching/swipe`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify({ toUserId, direction })
      });
      return (await readJsonOrThrow(res)) as SwipeResponse;
    },
    async sendChat(
      sessionToken: string,
      chatKind: "cruise" | "date",
      toKey: string,
      text: string,
      media?: Readonly<{ kind: "image" | "video" | "audio"; objectKey: string; mimeType: string; durationSeconds?: number }>
    ): Promise<any> {
      const res = await fetch(`${basePath}/chat/send`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify({ chatKind, toKey, text, media })
      });
      return readJsonOrThrow(res);
    },
    async sendCallSignal(
      sessionToken: string,
      payload: Readonly<{
        toKey: string;
        callId: string;
        signalType: "offer" | "answer" | "ice" | "hangup";
        sdp?: string;
        candidate?: string;
      }>
    ): Promise<{ ok: true }> {
      const res = await fetch(`${basePath}/call/signal`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify(payload)
      });
      return (await readJsonOrThrow(res)) as { ok: true };
    },
    async listChat(sessionToken: string, chatKind: "cruise" | "date", otherKey: string): Promise<any> {
      const url = new URL(`${basePath}/chat/messages`, window.location.origin);
      url.searchParams.set("chatKind", chatKind);
      url.searchParams.set("otherKey", otherKey);
      const res = await fetch(url.toString(), { method: "GET", headers: headers(sessionToken) });
      return readJsonOrThrow(res);
    },
    async listChatThreads(
      sessionToken: string,
      chatKind: "cruise" | "date"
    ): Promise<{ threads: ReadonlyArray<Readonly<{ otherKey: string; lastMessage: LocalChatMessage }>> }> {
      const url = new URL(`${basePath}/chat/threads`, window.location.origin);
      url.searchParams.set("chatKind", chatKind);
      const res = await fetch(url.toString(), { method: "GET", headers: headers(sessionToken) });
      return (await readJsonOrThrow(res)) as { threads: ReadonlyArray<Readonly<{ otherKey: string; lastMessage: LocalChatMessage }>> };
    },
    async markChatRead(sessionToken: string, chatKind: "cruise" | "date", otherKey: string): Promise<{ readAtMs: number }> {
      const res = await fetch(`${basePath}/chat/read`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify({ chatKind, otherKey })
      });
      return (await readJsonOrThrow(res)) as { readAtMs: number };
    },
    async initiateChatMediaUpload(
      sessionToken: string,
      payload: Readonly<{ mimeType: string; sizeBytes: number }>
    ): Promise<{ objectKey: string; uploadUrl: string; mimeType: string; expiresInSeconds: number }> {
      const res = await fetch(`${basePath}/chat/media/initiate`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify(payload)
      });
      return (await readJsonOrThrow(res)) as { objectKey: string; uploadUrl: string; mimeType: string; expiresInSeconds: number };
    },
    async getChatMediaUrl(
      sessionToken: string,
      objectKey: string
    ): Promise<{ objectKey: string; downloadUrl: string; expiresInSeconds: number }> {
      const url = new URL(`${basePath}/chat/media/url`, window.location.origin);
      url.searchParams.set("objectKey", objectKey);
      const res = await fetch(url.toString(), { method: "GET", headers: headers(sessionToken) });
      return (await readJsonOrThrow(res)) as { objectKey: string; downloadUrl: string; expiresInSeconds: number };
    },
    async block(sessionToken: string, targetKey: string): Promise<any> {
      const res = await fetch(`${basePath}/block`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify({ targetKey })
      });
      return readJsonOrThrow(res);
    },
    async unblock(sessionToken: string, targetKey: string): Promise<any> {
      const res = await fetch(`${basePath}/unblock`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify({ targetKey })
      });
      return readJsonOrThrow(res);
    },
    async listBlocked(sessionToken: string): Promise<{ blocked: ReadonlyArray<string> }> {
      const res = await fetch(`${basePath}/blocked`, {
        method: "GET",
        headers: headers(sessionToken)
      });
      return (await readJsonOrThrow(res)) as { blocked: ReadonlyArray<string> };
    },
    async reportUser(sessionToken: string, targetKey: string, reason: string): Promise<any> {
      const res = await fetch(`${basePath}/report/user`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify({ targetKey, reason })
      });
      return readJsonOrThrow(res);
    },
    async reportMessage(sessionToken: string, messageId: string, reason: string, targetKey?: string): Promise<any> {
      const res = await fetch(`${basePath}/report/message`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify({ messageId, reason, targetKey })
      });
      return readJsonOrThrow(res);
    },
    async getMyProfile(sessionToken: string): Promise<{ profile: UserProfile }> {
      const res = await fetch(`${basePath}/profile/me`, {
        method: "GET",
        headers: headers(sessionToken)
      });
      return (await readJsonOrThrow(res)) as { profile: UserProfile };
    },
    async getPublicProfiles(): Promise<{ profiles: ReadonlyArray<PublicProfile> }> {
      const res = await fetch(`${basePath}/profile/public`, {
        method: "GET",
        headers: headers()
      });
      return (await readJsonOrThrow(res)) as { profiles: ReadonlyArray<PublicProfile> };
    },
    async getPublicProfile(userId: string): Promise<{ profile: PublicProfile }> {
      const res = await fetch(`${basePath}/profile/public/${encodeURIComponent(userId)}`, {
        method: "GET",
        headers: headers()
      });
      return (await readJsonOrThrow(res)) as { profile: PublicProfile };
    },
    async getPublicMediaUrl(mediaId: string): Promise<{ downloadUrl: string }> {
      const res = await fetch(`${basePath}/media/public/${encodeURIComponent(mediaId)}/url`, {
        method: "GET",
        headers: headers()
      });
      return (await readJsonOrThrow(res)) as { downloadUrl: string };
    },
    async upsertMyProfile(sessionToken: string, payload: ProfileUpdatePayload): Promise<{ profile: UserProfile }> {
      const res = await fetch(`${basePath}/profile/me`, {
        method: "PUT",
        headers: headers(sessionToken),
        body: JSON.stringify(payload)
      });
      return (await readJsonOrThrow(res)) as { profile: UserProfile };
    },
    async updateProfileMediaReferences(
      sessionToken: string,
      payload: Readonly<{
        galleryMediaIds?: ReadonlyArray<string>;
        mainPhotoMediaId?: string;
      }>
    ): Promise<{ profile: UserProfile }> {
      const res = await fetch(`${basePath}/profile/media/references`, {
        method: "PUT",
        headers: headers(sessionToken),
        body: JSON.stringify(payload)
      });
      return (await readJsonOrThrow(res)) as { profile: UserProfile };
    },
    async initiateMediaUpload(
      sessionToken: string,
      payload: Readonly<{ kind: MediaKind; mimeType: string; sizeBytes: number }>
    ): Promise<InitiateMediaUploadResponse> {
      const res = await fetch(`${basePath}/profile/media/initiate`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify(payload)
      });
      return (await readJsonOrThrow(res)) as InitiateMediaUploadResponse;
    },
    async completeMediaUpload(sessionToken: string, mediaId: string): Promise<{ media: unknown }> {
      const res = await fetch(`${basePath}/profile/media/complete`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify({ mediaId })
      });
      return (await readJsonOrThrow(res)) as { media: unknown };
    },
    async getFavorites(sessionToken: string): Promise<{ favorites: ReadonlyArray<string> }> {
      const res = await fetch(`${basePath}/favorites`, { method: "GET", headers: headers(sessionToken) });
      return (await readJsonOrThrow(res)) as { favorites: ReadonlyArray<string> };
    },
    async toggleFavorite(sessionToken: string, targetUserId: string): Promise<FavoriteToggleResponse> {
      const res = await fetch(`${basePath}/favorites/toggle`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify({ targetUserId })
      });
      return (await readJsonOrThrow(res)) as FavoriteToggleResponse;
    },
    async listPublicPostings(type?: "ad" | "event", sessionToken?: string): Promise<{ postings: ReadonlyArray<PublicPosting> }> {
      const url = new URL(`${basePath}/public-postings`, window.location.origin);
      if (type) url.searchParams.set("type", type);
      const res = await fetch(url.toString(), { method: "GET", headers: sessionToken ? headers(sessionToken) : undefined });
      return (await readJsonOrThrow(res)) as { postings: ReadonlyArray<PublicPosting> };
    },
    async createPublicPosting(
      sessionToken: string,
      payload: Readonly<{
        type: "ad" | "event";
        title: string;
        body: string;
        photoMediaId?: string;
        lat?: number;
        lng?: number;
        eventStartAtMs?: number;
        locationInstructions?: string;
        groupDetails?: string;
      }>
    ): Promise<{ posting: PublicPosting }> {
      const res = await fetch(`${basePath}/public-postings`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify(payload)
      });
      return (await readJsonOrThrow(res)) as { posting: PublicPosting };
    },
    async inviteToEvent(
      sessionToken: string,
      payload: Readonly<{ postingId: string; targetUserId: string }>
    ): Promise<{ invite: { postingId: string; invitedUserId: string; invitedByUserId: string; createdAtMs: number } }> {
      const res = await fetch(`${basePath}/public-postings/event/invite`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify(payload)
      });
      return (await readJsonOrThrow(res)) as {
        invite: { postingId: string; invitedUserId: string; invitedByUserId: string; createdAtMs: number };
      };
    },
    async respondToEventInvite(sessionToken: string, payload: Readonly<{ postingId: string; accept: boolean }>): Promise<{ posting: PublicPosting }> {
      const res = await fetch(`${basePath}/public-postings/event/respond`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify(payload)
      });
      return (await readJsonOrThrow(res)) as { posting: PublicPosting };
    },
    async requestToJoinEvent(sessionToken: string, payload: Readonly<{ postingId: string }>): Promise<{ posting: PublicPosting }> {
      const res = await fetch(`${basePath}/public-postings/event/request-join`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify(payload)
      });
      return (await readJsonOrThrow(res)) as { posting: PublicPosting };
    },
    async respondToEventJoinRequest(
      sessionToken: string,
      payload: Readonly<{ postingId: string; targetUserId: string; accept: boolean }>
    ): Promise<{ posting: PublicPosting }> {
      const res = await fetch(`${basePath}/public-postings/event/respond-request`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify(payload)
      });
      return (await readJsonOrThrow(res)) as { posting: PublicPosting };
    },
    async listEventInvites(sessionToken: string): Promise<{ postings: ReadonlyArray<PublicPosting> }> {
      const res = await fetch(`${basePath}/public-postings/event/invites`, {
        method: "GET",
        headers: headers(sessionToken)
      });
      return (await readJsonOrThrow(res)) as { postings: ReadonlyArray<PublicPosting> };
    },
    async listCruisingSpots(sessionToken?: string): Promise<{ spots: ReadonlyArray<CruisingSpot> }> {
      const res = await fetch(`${basePath}/cruise-spots`, {
        method: "GET",
        headers: headers(sessionToken)
      });
      const parsed = (await readJsonOrThrow(res)) as { spots?: ReadonlyArray<CruisingSpot> };
      return { spots: mergePermanentCruisingSpots(Array.isArray(parsed.spots) ? parsed.spots : []) };
    },
    async createCruisingSpot(
      sessionToken: string,
      payload: Readonly<{ name: string; address: string; description: string; photoMediaId?: string }>
    ): Promise<{ spot: CruisingSpot }> {
      const res = await fetch(`${basePath}/cruise-spots`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify(payload)
      });
      return (await readJsonOrThrow(res)) as { spot: CruisingSpot };
    },
    async checkInCruisingSpot(
      sessionToken: string,
      spotId: string
    ): Promise<{ checkIn: { spotId: string; actorKey: string; checkedInAtMs: number } }> {
      const res = await fetch(`${basePath}/cruise-spots/${encodeURIComponent(spotId)}/check-in`, {
        method: "POST",
        headers: headers(sessionToken)
      });
      return (await readJsonOrThrow(res)) as { checkIn: { spotId: string; actorKey: string; checkedInAtMs: number } };
    },
    async markCruisingSpotAction(
      sessionToken: string,
      spotId: string
    ): Promise<{ action: { spotId: string; actorKey: string; markedAtMs: number } }> {
      const res = await fetch(`${basePath}/cruise-spots/${encodeURIComponent(spotId)}/action`, {
        method: "POST",
        headers: headers(sessionToken)
      });
      return (await readJsonOrThrow(res)) as { action: { spotId: string; actorKey: string; markedAtMs: number } };
    },
    async listCruisingSpotCheckIns(spotId: string): Promise<{ checkIns: ReadonlyArray<{ spotId: string; actorKey: string; checkedInAtMs: number }> }> {
      const res = await fetch(`${basePath}/cruise-spots/${encodeURIComponent(spotId)}/check-ins`, {
        method: "GET"
      });
      return (await readJsonOrThrow(res)) as { checkIns: ReadonlyArray<{ spotId: string; actorKey: string; checkedInAtMs: number }> };
    },
    async listSubmissions(): Promise<{ submissions: ReadonlyArray<Submission> }> {
      const res = await fetch(`${basePath}/submissions`, { method: "GET" });
      return (await readJsonOrThrow(res)) as { submissions: ReadonlyArray<Submission> };
    },
    async createSubmission(sessionToken: string, payload: Readonly<{ title: string; body: string }>): Promise<{ submission: Submission }> {
      const res = await fetch(`${basePath}/submissions`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify(payload)
      });
      return (await readJsonOrThrow(res)) as { submission: Submission };
    },
    async recordSubmissionView(submissionId: string): Promise<{ submission: Submission }> {
      const res = await fetch(`${basePath}/submissions/view`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ submissionId })
      });
      return (await readJsonOrThrow(res)) as { submission: Submission };
    },
    async rateSubmission(submissionId: string, stars: number): Promise<{ submission: Submission }> {
      const res = await fetch(`${basePath}/submissions/rate`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ submissionId, stars })
      });
      return (await readJsonOrThrow(res)) as { submission: Submission };
    },
    async adminListUsers(sessionToken: string): Promise<{ users: ReadonlyArray<AdminUserSummary> }> {
      const res = await fetch(`${basePath}/admin/users`, {
        method: "GET",
        headers: headers(sessionToken)
      });
      return (await readJsonOrThrow(res)) as { users: ReadonlyArray<AdminUserSummary> };
    },
    async adminBanUser(
      sessionToken: string,
      userId: string,
      reason?: string
    ): Promise<{ user: Pick<AdminUserSummary, "id" | "bannedAtMs" | "bannedReason"> }> {
      const res = await fetch(`${basePath}/admin/users/${encodeURIComponent(userId)}/ban`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify({ reason })
      });
      return (await readJsonOrThrow(res)) as { user: Pick<AdminUserSummary, "id" | "bannedAtMs" | "bannedReason"> };
    },
    async adminUnbanUser(sessionToken: string, userId: string): Promise<{ user: Pick<AdminUserSummary, "id" | "bannedAtMs" | "bannedReason"> }> {
      const res = await fetch(`${basePath}/admin/users/${encodeURIComponent(userId)}/unban`, {
        method: "POST",
        headers: headers(sessionToken)
      });
      return (await readJsonOrThrow(res)) as { user: Pick<AdminUserSummary, "id" | "bannedAtMs" | "bannedReason"> };
    },
    async adminListCruisingSpots(sessionToken: string): Promise<{ spots: ReadonlyArray<CruisingSpot> }> {
      const res = await fetch(`${basePath}/admin/cruise-spots`, {
        method: "GET",
        headers: headers(sessionToken)
      });
      const parsed = (await readJsonOrThrow(res)) as { spots?: ReadonlyArray<CruisingSpot> };
      return { spots: mergePermanentCruisingSpots(Array.isArray(parsed.spots) ? parsed.spots : []) };
    },
    async adminApproveCruisingSpot(sessionToken: string, spotId: string, reason?: string): Promise<{ spot: CruisingSpot }> {
      const res = await fetch(`${basePath}/admin/cruise-spots/${encodeURIComponent(spotId)}/approve`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify({ reason })
      });
      return (await readJsonOrThrow(res)) as { spot: CruisingSpot };
    },
    async adminRejectCruisingSpot(sessionToken: string, spotId: string, reason?: string): Promise<{ spot: CruisingSpot }> {
      const res = await fetch(`${basePath}/admin/cruise-spots/${encodeURIComponent(spotId)}/reject`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify({ reason })
      });
      return (await readJsonOrThrow(res)) as { spot: CruisingSpot };
    },
    async adminDeleteCruisingSpot(sessionToken: string, spotId: string): Promise<{ spotId: string }> {
      const res = await fetch(`${basePath}/admin/cruise-spots/${encodeURIComponent(spotId)}`, {
        method: "DELETE",
        headers: headers(sessionToken)
      });
      return (await readJsonOrThrow(res)) as { spotId: string };
    },
    async adminListPublicPostings(sessionToken: string, type?: "ad" | "event"): Promise<{ postings: ReadonlyArray<PublicPosting> }> {
      const query = type ? `?type=${encodeURIComponent(type)}` : "";
      const res = await fetch(`${basePath}/admin/public-postings${query}`, {
        method: "GET",
        headers: headers(sessionToken)
      });
      return (await readJsonOrThrow(res)) as { postings: ReadonlyArray<PublicPosting> };
    },
    async adminApprovePublicPosting(sessionToken: string, postingId: string, reason?: string): Promise<{ posting: PublicPosting }> {
      const res = await fetch(`${basePath}/admin/public-postings/${encodeURIComponent(postingId)}/approve`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify({ reason })
      });
      return (await readJsonOrThrow(res)) as { posting: PublicPosting };
    },
    async adminRejectPublicPosting(sessionToken: string, postingId: string, reason?: string): Promise<{ posting: PublicPosting }> {
      const res = await fetch(`${basePath}/admin/public-postings/${encodeURIComponent(postingId)}/reject`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify({ reason })
      });
      return (await readJsonOrThrow(res)) as { posting: PublicPosting };
    },
    async adminDeletePublicPosting(sessionToken: string, postingId: string): Promise<{ postingId: string }> {
      const res = await fetch(`${basePath}/admin/public-postings/${encodeURIComponent(postingId)}`, {
        method: "DELETE",
        headers: headers(sessionToken)
      });
      return (await readJsonOrThrow(res)) as { postingId: string };
    },
    async adminListSubmissions(sessionToken: string): Promise<{ submissions: ReadonlyArray<Submission> }> {
      const res = await fetch(`${basePath}/admin/submissions`, {
        method: "GET",
        headers: headers(sessionToken)
      });
      return (await readJsonOrThrow(res)) as { submissions: ReadonlyArray<Submission> };
    },
    async adminApproveSubmission(sessionToken: string, submissionId: string, reason?: string): Promise<{ submission: Submission }> {
      const res = await fetch(`${basePath}/admin/submissions/${encodeURIComponent(submissionId)}/approve`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify({ reason })
      });
      return (await readJsonOrThrow(res)) as { submission: Submission };
    },
    async adminRejectSubmission(sessionToken: string, submissionId: string, reason?: string): Promise<{ submission: Submission }> {
      const res = await fetch(`${basePath}/admin/submissions/${encodeURIComponent(submissionId)}/reject`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify({ reason })
      });
      return (await readJsonOrThrow(res)) as { submission: Submission };
    },
    async adminDeleteSubmission(sessionToken: string, submissionId: string): Promise<{ submissionId: string }> {
      const res = await fetch(`${basePath}/admin/submissions/${encodeURIComponent(submissionId)}`, {
        method: "DELETE",
        headers: headers(sessionToken)
      });
      return (await readJsonOrThrow(res)) as { submissionId: string };
    },
    async listPromotedProfiles(): Promise<{ listings: ReadonlyArray<PromotedProfileListing>; feeCents: number }> {
      const res = await fetch(`${basePath}/promoted-profiles`, { method: "GET" });
      return (await readJsonOrThrow(res)) as { listings: ReadonlyArray<PromotedProfileListing>; feeCents: number };
    },
    async startPromotedPayment(
      sessionToken: string
    ): Promise<{ payment: { paymentToken: string; amountCents: number; status: string; expiresAtMs: number } }> {
      const res = await fetch(`${basePath}/promoted-profiles/payment/start`, {
        method: "POST",
        headers: headers(sessionToken)
      });
      return (await readJsonOrThrow(res)) as { payment: { paymentToken: string; amountCents: number; status: string; expiresAtMs: number } };
    },
    async confirmPromotedPayment(
      sessionToken: string,
      paymentToken: string
    ): Promise<{ payment: { paymentToken: string; amountCents: number; status: string; expiresAtMs: number } }> {
      const res = await fetch(`${basePath}/promoted-profiles/payment/confirm`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify({ paymentToken })
      });
      return (await readJsonOrThrow(res)) as { payment: { paymentToken: string; amountCents: number; status: string; expiresAtMs: number } };
    },
    async createPromotedProfile(
      sessionToken: string,
      payload: Readonly<{ paymentToken: string; title: string; body: string; displayName: string }>
    ): Promise<{ listing: PromotedProfileListing }> {
      const res = await fetch(`${basePath}/promoted-profiles`, {
        method: "POST",
        headers: headers(sessionToken),
        body: JSON.stringify(payload)
      });
      return (await readJsonOrThrow(res)) as { listing: PromotedProfileListing };
    }
  };
}
