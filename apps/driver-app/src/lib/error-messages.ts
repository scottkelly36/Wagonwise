import { ApiError } from '../api/errors';

const ROUTING_MESSAGES: Record<string, string> = {
  InvalidName: 'Give this vehicle a name.',
  InvalidDimensions: 'Every measurement must be a positive number.',
  VehicleProfileNotFound: "That vehicle isn't there any more.",
  RoutePlanNotFound: "That route isn't there any more. Plan it again.",
  TripAlreadyActive: 'You already have a trip in progress.',
  ActiveTripNotFound: "That trip isn't there any more.",
};

export function routingErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return ROUTING_MESSAGES[error.tag] ?? 'Something went wrong. Try again.';
  }
  return "Couldn't reach the server. Check your connection.";
}

const HAZARDS_MESSAGES: Record<string, string> = {
  InvalidMeasurement: 'The measurement must be a positive number.',
  HazardReportNotFound: "That report isn't there any more.",
};

export function hazardsErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return HAZARDS_MESSAGES[error.tag] ?? 'Something went wrong. Try again.';
  }
  return "Couldn't reach the server. Check your connection.";
}

const FEEDBACK_MESSAGES: Record<string, string> = {
  InvalidMessage: 'Write a note before sending.',
};

export function feedbackErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return FEEDBACK_MESSAGES[error.tag] ?? 'Something went wrong. Try again.';
  }
  return "Couldn't reach the server. Check your connection.";
}

const IDENTITY_MESSAGES: Record<string, string> = {
  DriverNotFound: "Your account isn't there any more.",
};

export function identityErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return IDENTITY_MESSAGES[error.tag] ?? 'Something went wrong. Try again.';
  }
  return "Couldn't reach the server. Check your connection.";
}

const FLEET_MESSAGES: Record<string, string> = {
  InvalidCode: "That code isn't right. Check it with your company and try again.",
  AlreadyLinked: "You're already linked to that company.",
  TooManyAttempts: 'Too many wrong codes. Try again in 15 minutes.',
  LinkNotFound: "That invitation or request isn't there any more.",
  InvalidLinkTransition: 'That has already been decided.',
};

export function fleetErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return FLEET_MESSAGES[error.tag] ?? 'Something went wrong. Try again.';
  }
  return "Couldn't reach the server. Check your connection.";
}

const JOBS_MESSAGES: Record<string, string> = {
  JobNotFound: "That job isn't there any more.",
  InvalidTransition: 'That job has already moved on — pull to refresh.',
  ProofOfDeliveryRequired: 'Take a photo of the delivery first — this job needs one.',
};

/** Raised when "Start" cannot get a position to plan the route from. */
export class LocationUnavailableError extends Error {
  constructor() {
    super('location unavailable');
  }
}

const NAVIGATION_MESSAGES: Record<string, string> = {
  NoVehicleAssigned: 'No vehicle has been assigned to this job yet. Ask dispatch to assign one.',
  VehicleUnavailable: "This job's vehicle can't be used. Ask dispatch to check it.",
  NotTracking: 'Accept the job first.',
  NoRouteFound: 'No route found for this vehicle. It may not fit the roads. Ask dispatch.',
  TripAlreadyActive: 'You already have a trip in progress. End it first.',
};

/** What went wrong starting navigation for a job: the position, the vehicle, or planning the route. */
export function jobNavigationErrorMessage(error: unknown): string {
  if (error instanceof LocationUnavailableError) {
    return "Can't get your location. Turn location on and try again.";
  }
  if (error instanceof ApiError) {
    return (
      NAVIGATION_MESSAGES[error.tag] ??
      ROUTING_MESSAGES[error.tag] ??
      JOBS_MESSAGES[error.tag] ??
      'Something went wrong. Try again.'
    );
  }
  return "Couldn't reach the server. Check your connection.";
}

export function jobsErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return JOBS_MESSAGES[error.tag] ?? 'Something went wrong. Try again.';
  }
  return "Couldn't reach the server. Check your connection.";
}
