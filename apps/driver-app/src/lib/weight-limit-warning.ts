/** Shown when no route exists for the vehicle's weight and the only one found goes past a signed weight limit. The wording says
 *  what is known (a weight limit is on the way), what is not (whether the sign allows access), and who decides (the driver). */
export const WEIGHT_LIMIT_BANNER =
  "We couldn't find a route that keeps to every weight limit for this vehicle. The routes below go past one. A sign may still allow access for a delivery, so check the signs.";

export const WEIGHT_LIMIT_CONFIRM_TITLE = 'This route goes past a weight limit';

export const WEIGHT_LIMIT_CONFIRM_BODY =
  "There is no way round it for this vehicle's weight. Check the signs on the road, and only go where you are allowed to. You are responsible for where you drive.";

/** The short line on a route that goes past a weight limit, on its card and on the route overview. */
export const WEIGHT_LIMIT_SHORT = 'Goes past a weight limit';
