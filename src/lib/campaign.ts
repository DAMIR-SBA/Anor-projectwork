/** Campaign pages open at the start time; ANOR Plus members get in `plusEarlyHours` earlier. */
export function campaignOpenFor(c: { startsAt: Date; plusEarlyHours: number }, isPlus: boolean, now: number = Date.now()): boolean {
  const earlyStart = c.startsAt.getTime() - c.plusEarlyHours * 3_600_000;
  return now >= c.startsAt.getTime() || (isPlus && now >= earlyStart);
}
