import assert from "node:assert/strict";
import test from "node:test";

import { query } from "../src/config/db.js";
import {
  defaultReservationStatuses,
  listReservationStatuses,
  updateReservationStatuses,
} from "../src/services/reservation-statuses.service.js";

const getDemoUserId = async () => {
  const { rows } = await query(
    "SELECT id FROM users WHERE account_role = 'provider' ORDER BY created_at ASC LIMIT 1"
  );
  return rows[0].id;
};

test("listReservationStatuses returns the 5 provider statuses in order", async () => {
  const userId = await getDemoUserId();

  const statuses = await listReservationStatuses(userId);

  assert.equal(statuses.length, 5);
  assert.deepEqual(
    statuses.map((status) => status.code),
    defaultReservationStatuses.map((status) => status.code)
  );
  assert.deepEqual(
    statuses.map((status) => Number(status.position)),
    [0, 1, 2, 3, 4]
  );
});

test("updateReservationStatuses persists labels and colors without changing the 5 codes", async () => {
  const userId = await getDemoUserId();

  const updatedStatuses = defaultReservationStatuses.map((status, index) => ({
    code: status.code,
    label: `${status.label} ${index + 1}`,
    color: index === 0 ? "#C13C3C" : status.color,
  }));

  const response = await updateReservationStatuses(userId, updatedStatuses);

  assert.equal(response.length, 5);
  assert.equal(response[0].code, "pending");
  assert.equal(response[0].label, "Non paye / En attente 1");
  assert.equal(response[0].color, "#C13C3C");
  assert.deepEqual(
    response.map((status) => status.code),
    defaultReservationStatuses.map((status) => status.code)
  );
});
