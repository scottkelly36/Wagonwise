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
