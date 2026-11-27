import { describe, expect, it } from 'vitest';
import { TRACKER_HOSTS, isThirdParty, isTracker, siteOf } from '../src/shared/trackers';

describe('tracker blocking', () => {
  it('exports the list the fork hands to its browser process: bare lowercase hosts, each one blocked', () => {
    expect(TRACKER_HOSTS.length).toBeGreaterThan(0);
    for (const host of TRACKER_HOSTS) {
      expect(host).toMatch(/^[a-z0-9.-]+\.[a-z]+$/);
      expect(isTracker(host)).toBe(true);
    }
  });
  it('matches a listed host and its subdomains, not look-alikes', () => {
    expect(isTracker('www.google-analytics.com')).toBe(true);
    expect(isTracker('stats.g.doubleclick.net')).toBe(true);
    expect(isTracker('example.com')).toBe(false);
    expect(isTracker('notdoubleclick.net')).toBe(false);
  });
  it('tells first party from third party across common suffixes', () => {
    expect(siteOf('a.b.example.co.uk')).toBe('example.co.uk');
    expect(siteOf('cdn.example.com')).toBe('example.com');
    expect(isThirdParty('static.example.com', 'www.example.com')).toBe(false);
    expect(isThirdParty('cdn.other.com', 'www.example.com')).toBe(true);
    expect(isThirdParty('cdn.other.com', '')).toBe(false);
  });
});
