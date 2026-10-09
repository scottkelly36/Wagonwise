import { ApiError } from '../../api/errors';
import { PostcodeNotFoundError } from '../../lib/postcodes';

/** Plain-English text for the staff routes' error tags (core's `staff-error-mapping.ts`). */
const MESSAGES: Record<string, string> = {
  InvalidCredentials: "That email and password don't match.",
  InvalidCode: "That code isn't right. Check it and try again.",
  ChallengeNotUsable: 'That sign-in has expired or had too many tries. Please start again.',
  EnrolmentNotUsable: 'That set-up has expired or had too many tries. Open your invite link again.',
  InviteNotUsable: 'This invite link has expired or has already been used.',
  EmailAlreadyInUse: 'There is already an account with that email address.',
  LastManager: 'A company needs at least one person who can manage users.',
  PrivilegeNotHeld: 'You can only give privileges you have yourself.',
  NotAFleetUser: 'WagonWise staff accounts have no per-company privileges.',
  Forbidden: "You're not allowed to do that.",
  StaffNotFound: 'That person could not be found.',
  CodeNotSent: "We couldn't send the code just now. Please try again.",
  NotSignedIn: 'Please sign in again.',
  RefreshTokenInvalid: 'Your session has ended. Please sign in again.',
  InvalidIdentifier: "That doesn't look like a phone number or email address.",
  AlreadyInvited: 'There is already a pending invitation for that phone number or email.',
  AlreadyLinked: 'That driver is already linked to this company.',
  LinkNotFound: 'That invitation or request could not be found.',
  InvalidLinkTransition: 'That has already been decided.',
  InvalidReference: 'Enter a job reference.',
  InvalidStops: 'A job needs at least one pickup and one delivery stop.',
  InvalidTransition: "That job can't move to that status right now.",
  JobNotFound: 'That job could not be found.',
  DriverNotInCompany: "That driver doesn't belong to this company.",
  VehicleNotInCompany: "That vehicle doesn't belong to this company.",
  DriverBusy: 'That driver is already on another active job.',
  VehicleBusy: 'That vehicle is already out on another active job.',
  CapacityReached:
    "The plan doesn't cover any more vehicles. Ask WagonWise to raise it (WagonWise staff: Plans page).",
  DayInPast: 'Pick today or a later day; a past day would change what was already billed.',
  InvalidPrice: 'Enter a price between £0 and £10,000.',
  InvalidCapacity: 'Enter a whole number of vehicles.',
  InvalidTemplate: 'That check list is not complete. Check the name and every question.',
  TemplateNotFound: 'That check list could not be found.',
  NotFound: 'That could not be found.',
  InvalidRange: 'Pick a sensible range of days.',
  InvalidRetention: 'Choose between 1 month and 10 years.',
  CostNotFound: 'That cost could not be found.',
  DefectNotFound: 'That defect could not be found.',
  DefectAlreadyFixed: 'That defect is already fixed, so there is nothing to repair.',
  RepairNotFound: 'That repair could not be found.',
  RepairNotOpen: 'That repair has already been finished or cancelled.',
  InvalidRepair:
    'Pick a due date from today on, or a done date no later than today; notes are 500 characters at most.',
  FirmNotEnabled: 'Your company has not turned this on.',
  NotOnAJob: 'You are not on a job.',
  NotSharing: 'Sharing is switched off.',
  InvalidRunningCost:
    'Give it a name (80 characters at most), a monthly amount in pounds and pence, and a month.',
  InvalidRate:
    'Enter what the driver costs an hour, in pounds and pence (up to £500), and the day it starts.',
  DriverNotFound: 'That driver could not be found.',
  NoRows: 'There is nothing in that file to import.',
  InvalidCommercial:
    'Check the customer (120 characters at most) and the price (pounds and pence, up to £1,000,000).',
  NothingToSend: 'That job is no longer waiting for its driver, so there is nothing to send.',
  TooManyRows: 'That is too many rows for one go. Split the file in two.',
  InvalidItemType: 'Check the name, how often it repeats, and the warning period.',
  ItemNotFound: 'That item could not be found.',
  VehicleNotFound: 'That vehicle could not be found.',
  ItemNotForVehicle: "That item isn't tracked for this vehicle.",
  InvalidWork:
    "Check the dates: work can't be recorded for a day to come, and the next date must be after the day it was done.",
  InvalidRegistration:
    'A registration is 2 to 8 letters and numbers. Leave it blank if the vehicle has none yet.',
  RegistrationTaken: 'Another vehicle in this company already has that registration.',
  InvalidCost: 'Check the type, the description and the amount.',
  InvalidCostChange:
    "That change doesn't fit this cost: it can't start before the cost began or after it ended.",
  InvoiceNotFound: 'That invoice could not be found.',
  InvalidInvoiceState:
    "That can't be done to an invoice in its current state. Issued invoices can't be edited.",
  BillingDetailsIncomplete:
    "Fill in WagonWise's billing details first (Billing details page): invoices can't be issued while any are in [brackets].",
  EmptyInvoice: 'An invoice needs at least one line.',
  NegativeTotal: "An invoice can't total less than nothing. Remove the credit or add a charge.",
  MonthNotStarted: "That month hasn't started yet.",
  InvalidMonth: 'Pick a valid month.',
  InvalidLine: 'Enter a description and an amount in pounds and pence.',
  InvalidDay: 'Pick a valid date.',
  CompanyNotFound: 'That company could not be found.',
  ProofOfDeliveryNotFound: 'No photo has been received for that job yet.',
  HazardReportNotFound: 'That hazard report is not there any more.',
  InvalidMeasurement: 'A measurement has to be a number above zero.',
  NoRouteForVehicle:
    'No route found for that vehicle between the stops. It may be too tall, wide or heavy for the roads.',
};

export function staffErrorMessage(error: unknown): string {
  // Core's per-account lockout (TooManyAttempts) and the staff BFF's per-address limit.
  if (error instanceof ApiError && error.status === 429) {
    return 'Too many attempts. Please wait 15 minutes, then try again.';
  }
  if (error instanceof PostcodeNotFoundError) {
    return `We can't find the postcode ${error.postcode}. Check it and try again.`;
  }
  if (error instanceof ApiError)
    return MESSAGES[error.tag] ?? `Something went wrong (${error.tag}).`;
  return 'Something went wrong. Please try again.';
}
