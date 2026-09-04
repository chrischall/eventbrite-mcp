import { describe, it, expect } from 'vitest';
import { viewResponse, EB_VIEWS } from '../src/view.js';

const parse = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);

describe('the rungs', () => {
  it('offers compact and full, and not raw — full already IS the upstream payload', () => {
    expect(EB_VIEWS).toEqual(['compact', 'full']);
  });

  it('defaults to compact when no view is given', () => {
    const data = { id: 1, photo: 'https://cdn/x.png' };
    expect(parse(viewResponse(undefined, data))).toEqual({ id: 1 });
  });
});

describe('what compact does — and what it deliberately does not', () => {
  it('strips image and avatar URLs', () => {
    const data = { users: [{ id: 7, name: 'A', avatar: 'https://cdn/a.png', photoUrl: 'https://cdn/b.jpg' }] };
    expect(parse(viewResponse('compact', data))).toEqual({ users: [{ id: 7, name: 'A' }] });
  });

  it('keeps EVERY other field, because nothing here knows which Eventbrite fields matter', () => {
    // The honest ceiling for this repo: no schema, no fixture, no documented
    // shape, no live tenant. A field list invented here could drop something a
    // caller needs, and the record would come back with holes in it looking
    // like a verified answer.
    const record = {
      id: '5', name: { text: 'Meetup' }, capacity: 80, status: 'live',
      ticket_availability: { has_available_tickets: true }, ended: null,
      somethingNobodyAnticipated: 'kept',
    };
    expect(parse(viewResponse('compact', { data: [record] }))).toEqual({ data: [record] });
  });

  it('keeps null — an absent key and a null one are different facts', () => {
    expect(parse(viewResponse('compact', { endedAt: null }))).toEqual({ endedAt: null });
  });

  it('keeps a page URL', () => {
    const d = { link: 'https://www.eventbrite.com/e/meetup-tickets-5' };
    expect(parse(viewResponse('compact', d))).toEqual(d);
  });
});

describe('full', () => {
  it('returns the payload untouched, images included', () => {
    const data = { id: 1, photo: 'https://cdn/x.png' };
    expect(parse(viewResponse('full', data))).toEqual(data);
  });
});

describe('whitespace', () => {
  it('emits none of its own, and never touches whitespace inside a value', () => {
    const description = 'Line one.\n\n  Indented.   ';
    const text = viewResponse('compact', { description }).content[0].text;
    expect(text.split('\n')).toHaveLength(1);
    expect(JSON.parse(text).description).toBe(description);
  });
});
