/**
 * The files of a first-generation tachograph driver card that a download copies, in the order they are read and written. The
 * identifiers and size rules are those the open-source parsers and the Cardpeek tachograph script agree on (docs/tachograph-card-reader.md).
 * Newer (second-generation) cards hold a second copy of the application with more files; this does not read them yet.
 */

export interface AppIdentification {
  /** 1 for a driver card. */
  readonly cardType: number;
  readonly eventsPerType: number;
  readonly faultsPerType: number;
  /** The length of the driver activity data's cyclic buffer, in bytes. */
  readonly activityStructureLength: number;
  readonly vehicleRecords: number;
  readonly placeRecords: number;
}

/** The ten bytes of EF_Application_Identification: type, structure version, then the counters that set the other files' sizes. */
export function parseAppIdentification(bytes: Uint8Array): AppIdentification | undefined {
  if (bytes.length < 10) return undefined;
  return {
    cardType: bytes[0] as number,
    eventsPerType: bytes[3] as number,
    faultsPerType: bytes[4] as number,
    activityStructureLength: ((bytes[5] as number) << 8) | (bytes[6] as number),
    vehicleRecords: ((bytes[7] as number) << 8) | (bytes[8] as number),
    placeRecords: bytes[9] as number,
  };
}

/** What a file that does not depend on the counters is given to size itself from, before they have been read. */
export const NO_APPLICATION_YET: AppIdentification = {
  cardType: 0,
  eventsPerType: 0,
  faultsPerType: 0,
  activityStructureLength: 0,
  vehicleRecords: 0,
  placeRecords: 0,
};

export const FID = {
  ICC: 0x0002,
  IC: 0x0005,
  APPLICATION_IDENTIFICATION: 0x0501,
  EVENTS_DATA: 0x0502,
  FAULTS_DATA: 0x0503,
  DRIVER_ACTIVITY_DATA: 0x0504,
  VEHICLES_USED: 0x0505,
  PLACES: 0x0506,
  CURRENT_USAGE: 0x0507,
  CONTROL_ACTIVITY_DATA: 0x0508,
  CARD_DOWNLOAD: 0x050e,
  IDENTIFICATION: 0x0520,
  DRIVING_LICENCE_INFO: 0x0521,
  SPECIFIC_CONDITIONS: 0x0522,
  CARD_CERTIFICATE: 0xc100,
  CA_CERTIFICATE: 0xc108,
} as const;

export interface CardFileSpec {
  readonly fid: number;
  readonly name: string;
  /** Whether the card signs this file (a hash, then a signature, is asked for and kept after the data). */
  readonly signed: boolean;
  /** Whether a card without the file is still a good download. */
  readonly optional: boolean;
  /** The file's size in bytes. Some depend on the counters in EF_Application_Identification, read first. */
  readonly size: (app: AppIdentification) => number;
}

const fixed = (n: number) => (): number => n;

/** Read before the tachograph application is selected: they sit at the top of the card. */
export const ROOT_FILES: readonly CardFileSpec[] = [
  { fid: FID.ICC, name: 'Card identification', signed: false, optional: false, size: fixed(25) },
  { fid: FID.IC, name: 'Chip identification', signed: false, optional: false, size: fixed(8) },
];

/** EF_Application_Identification is read first within the application: its counters size the files after it. */
export const APPLICATION_IDENTIFICATION: CardFileSpec = {
  fid: FID.APPLICATION_IDENTIFICATION,
  name: 'Application identification',
  signed: true,
  optional: false,
  size: fixed(10),
};

/** The rest of the application, in the order they are written. */
export const APPLICATION_FILES: readonly CardFileSpec[] = [
  {
    fid: FID.CARD_CERTIFICATE,
    name: 'Card certificate',
    signed: false,
    optional: false,
    size: fixed(194),
  },
  {
    fid: FID.CA_CERTIFICATE,
    name: 'Authority certificate',
    signed: false,
    optional: false,
    size: fixed(194),
  },
  {
    fid: FID.IDENTIFICATION,
    name: 'Card and holder details',
    signed: true,
    optional: false,
    size: fixed(143),
  },
  { fid: FID.CARD_DOWNLOAD, name: 'Last download', signed: false, optional: false, size: fixed(4) },
  {
    fid: FID.DRIVING_LICENCE_INFO,
    name: 'Driving licence',
    signed: true,
    optional: false,
    size: fixed(53),
  },
  {
    fid: FID.EVENTS_DATA,
    name: 'Events',
    signed: true,
    optional: false,
    size: (a) => a.eventsPerType * 24 * 6,
  },
  {
    fid: FID.FAULTS_DATA,
    name: 'Faults',
    signed: true,
    optional: false,
    size: (a) => a.faultsPerType * 24 * 2,
  },
  {
    fid: FID.DRIVER_ACTIVITY_DATA,
    name: 'Driver activity',
    signed: true,
    optional: false,
    size: (a) => a.activityStructureLength + 4,
  },
  {
    fid: FID.VEHICLES_USED,
    name: 'Vehicles used',
    signed: true,
    optional: false,
    size: (a) => a.vehicleRecords * 31 + 2,
  },
  {
    fid: FID.PLACES,
    name: 'Places',
    signed: true,
    optional: false,
    size: (a) => a.placeRecords * 10 + 1,
  },
  {
    fid: FID.CURRENT_USAGE,
    name: 'Current vehicle',
    signed: true,
    optional: false,
    size: fixed(19),
  },
  {
    fid: FID.CONTROL_ACTIVITY_DATA,
    name: 'Last roadside check',
    signed: true,
    optional: false,
    size: fixed(46),
  },
  // Present on newer cards; an older card without it is still a good download.
  {
    fid: FID.SPECIFIC_CONDITIONS,
    name: 'Specific conditions',
    signed: true,
    optional: true,
    size: fixed(280),
  },
];

/** How many files a full download reads, for a progress count (the root files, the identification, then the rest). */
export const TOTAL_STEPS = ROOT_FILES.length + 1 + APPLICATION_FILES.length;

export function fidText(fid: number): string {
  return fid.toString(16).toUpperCase().padStart(4, '0');
}
