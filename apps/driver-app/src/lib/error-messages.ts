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
