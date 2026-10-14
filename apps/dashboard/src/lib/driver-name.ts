/** What the portal shows for a driver: the company's own label, else the name the driver gave themselves, else their
 *  sign-in (phone or email). The same rule everywhere, so a driver is never two different people on two pages. */
export interface NameableDriver {
  readonly label?: string | undefined;
  readonly driverName?: string | undefined;
  readonly driverIdentifier?: string | undefined;
  readonly invitedIdentifier?: string | undefined;
  readonly driverId?: string | undefined;
}

export function driverDisplayName(driver: NameableDriver): string {
  return (
    driver.label ??
    driver.driverName ??
    driver.invitedIdentifier ??
    driver.driverIdentifier ??
    driver.driverId ??
    ''
  );
}

/** The sign-in, shown quietly beside a name so staff can still tell who it is, or nothing when the name is the sign-in. */
export function driverSubtext(driver: NameableDriver): string | undefined {
  const identifier = driver.invitedIdentifier ?? driver.driverIdentifier;
  return identifier !== undefined && identifier !== driverDisplayName(driver)
    ? identifier
    : undefined;
}

/** A driver's display name by driver id, for pages that hold a list of links and look drivers up by job. */
export function driverNamesById(
  links: readonly (NameableDriver & { readonly driverId?: string | undefined })[],
): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  for (const link of links) {
    if (link.driverId !== undefined) names.set(link.driverId, driverDisplayName(link));
  }
  return names;
}
