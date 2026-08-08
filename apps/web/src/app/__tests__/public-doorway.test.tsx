import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import HomePage from '../page';

describe('public doorway', () => {
  const markup = renderToStaticMarkup(<HomePage />);

  it('keeps the primary navigation small and sends users to real destinations', () => {
    expect(markup).toContain('href="/"');
    expect(markup).toContain('href="#markets"');
    expect(markup).toContain('href="#services"');
    expect(markup).toContain('href="/login"');

    expect(markup).not.toContain('href="/radar"');
    expect(markup).not.toContain('href="/pricing"');
    expect(markup).not.toContain('href="/decision-cards"');
    expect(markup).not.toContain('href="/dashboard');
  });

  it('contains one primary action and the implemented Trade #0001 lifecycle', () => {
    expect(markup.match(/data-primary-action/g)).toHaveLength(1);
    expect(markup).toContain('href="/world"');
    expect(markup).toContain('Open Nova');
    expect(markup).toContain('Apex Washing');
    expect(markup).toContain('Greencastle Storage and Parking');
    expect(markup).toContain('Verified parcel and building geometry');
    expect(markup).toContain('FIELD_MEASUREMENT_TASK_CREATED');
    expect(markup).toContain('no external side effect was performed');
  });

  it('labels unfinished revenue surfaces without unsupported execution claims', () => {
    expect(markup).toContain('Preview · not operational');
    expect(markup).toContain('Webull account sync, brokerage data, and live or paper order execution are not connected');
    expect(markup).toContain('Pilot · human delivered');
    expect(markup).toContain('A complete intake returns a durable receipt');
    expect(markup).toContain('href="/services/back-office-os"');

    expect(markup).not.toContain('Live demand radar');
    expect(markup).not.toContain('See the live radar');
    expect(markup).not.toContain('Open the screener');
    expect(markup).not.toContain('Most popular');
  });
});
