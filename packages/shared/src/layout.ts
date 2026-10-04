import layoutJson from '../../../config/office.layout.json';
import { OfficeLayout, type Desk, type Point } from './schemas';

/** Validated office layout. Throws at import time if config/office.layout.json is invalid. */
export const officeLayout: OfficeLayout = OfficeLayout.parse(layoutJson);

export function findDesk(layout: OfficeLayout, deskId: string): Desk | undefined {
  return layout.desks.find((desk) => desk.id === deskId);
}

export function seatOf(layout: OfficeLayout, deskId: string): Point {
  const desk = findDesk(layout, deskId);
  if (!desk) {
    throw new Error(`Desk "${deskId}" tidak ada di office.layout.json`);
  }
  return desk.seat;
}
