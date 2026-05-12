const moment = require('moment-timezone');

const ENDPOINT = 'https://api.getjobber.com/api/graphql';
const TOKEN_URL = 'https://api.getjobber.com/api/oauth/token';

const TIMEZONE = 'America/Chicago';
const AVAILABLE_SLOTS = ['9:00 AM', '11:00 AM', '1:00 PM', '3:00 PM'];

// ─── Token management ─────────────────────────────────────────────────────────

const tokenCache = {};

function getClientJobberConfig(clientId) {
  if (process.env.CLIENTS_CONFIG) {
    const configs = JSON.parse(process.env.CLIENTS_CONFIG);
    const config = configs[clientId];
    if (config?.jobberAccessToken) return config;
    return null;
  }
  if (!process.env.JOBBER_ACCESS_TOKEN) return null;
  return {
    jobberAccessToken: process.env.JOBBER_ACCESS_TOKEN,
    jobberRefreshToken: process.env.JOBBER_REFRESH_TOKEN,
  };
}

function getCachedTokens(clientId) {
  if (!tokenCache[clientId]) {
    const config = getClientJobberConfig(clientId);
    if (!config) return null;
    tokenCache[clientId] = {
      accessToken: config.jobberAccessToken,
      refreshToken: config.jobberRefreshToken,
    };
  }
  return tokenCache[clientId];
}

async function refreshAccessToken(clientId) {
  const cached = tokenCache[clientId];
  if (!cached?.refreshToken) throw new Error(`No Jobber refresh token for client: ${clientId}`);

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: cached.refreshToken,
      client_id: process.env.JOBBER_CLIENT_ID,
      client_secret: process.env.JOBBER_CLIENT_SECRET,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Jobber token refresh failed: ${data.error_description || data.error}`);

  tokenCache[clientId] = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || cached.refreshToken,
  };
  // Log new refresh token so you can update CLIENTS_CONFIG in Railway
  console.log(`[Jobber] Token refreshed for "${clientId}". New refresh token: ${tokenCache[clientId].refreshToken}`);
  return data.access_token;
}

async function gql(clientId, query, variables) {
  const tokens = getCachedTokens(clientId);
  if (!tokens) throw new Error(`Jobber not configured for client: ${clientId}`);

  const run = (accessToken) =>
    fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-JOBBER-GRAPHQL-VERSION': '2024-11-15',
      },
      body: JSON.stringify({ query, variables }),
    });

  let res = await run(tokens.accessToken);

  if (res.status === 401) {
    const newToken = await refreshAccessToken(clientId);
    res = await run(newToken);
  }

  const body = await res.json();
  if (!res.ok) throw new Error(`Jobber API ${res.status}: ${JSON.stringify(body)}`);
  if (body.errors?.length) throw new Error(`Jobber GraphQL: ${body.errors[0].message}`);
  return body.data;
}

// ─── Availability ─────────────────────────────────────────────────────────────

async function getAvailableSlots(dateStr, clientId) {
  const startOfDay = moment.tz(dateStr, 'YYYY-MM-DD', TIMEZONE).startOf('day').toISOString();
  const endOfDay = moment.tz(dateStr, 'YYYY-MM-DD', TIMEZONE).endOf('day').toISOString();

  // NOTE: If this filter doesn't work, open GraphiQL in your Jobber Developer Center
  // and inspect the JobFilterAttributes type for the correct date-range field names.
  const data = await gql(clientId, `
    query JobsOnDate($filter: JobFilterAttributes) {
      jobs(filter: $filter) {
        nodes {
          id
          startAt
          endAt
        }
      }
    }
  `, {
    filter: {
      startDate: dateStr,
      endDate: dateStr,
    },
  });

  const bookedTimes = new Set(
    (data?.jobs?.nodes || [])
      .filter((job) => job.startAt)
      .map((job) => moment.tz(job.startAt, TIMEZONE).format('h:mm A'))
  );

  return {
    available: AVAILABLE_SLOTS.filter((s) => !bookedTimes.has(s)),
    booked: AVAILABLE_SLOTS.filter((s) => bookedTimes.has(s)),
  };
}

// ─── Client find-or-create ────────────────────────────────────────────────────

function parseAddress(addressStr) {
  if (!addressStr) return {};
  const parts = addressStr.split(',').map((s) => s.trim());
  return {
    street1: parts[0] || addressStr,
    city: parts[1] || '',
    postalCode: (parts[2] || '').match(/\d{5}/)?.[0] || '',
    country: 'US',
  };
}

async function findClientByPhone(clientId, phone) {
  const digits = phone.replace(/\D/g, '');

  // searchTerm searches across name, phone, email in Jobber
  const data = await gql(clientId, `
    query FindClient($searchTerm: String!) {
      clients(searchTerm: $searchTerm) {
        nodes {
          id
          firstName
          lastName
        }
      }
    }
  `, { searchTerm: digits });

  return data?.clients?.nodes?.[0] ?? null;
}

async function createJobberClient(clientId, { name, phone, address }) {
  const nameParts = name.trim().split(/\s+/);
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(' ') || '-';

  const data = await gql(clientId, `
    mutation ClientCreate($input: ClientCreateInput!) {
      clientCreate(input: $input) {
        client { id }
        userErrors { message path }
      }
    }
  `, {
    input: {
      firstName,
      lastName,
      phones: phone ? [{ number: phone, description: 'MAIN', primary: true }] : [],
      billingAddress: parseAddress(address),
    },
  });

  const errors = data?.clientCreate?.userErrors;
  if (errors?.length) throw new Error(`Jobber clientCreate: ${errors[0].message}`);
  return data.clientCreate.client.id;
}

async function findOrCreateClient(clientId, { name, phone, address }) {
  if (phone) {
    const existing = await findClientByPhone(clientId, phone);
    if (existing) return existing.id;
  }
  return createJobberClient(clientId, { name, phone, address });
}

// ─── Booking ──────────────────────────────────────────────────────────────────

async function createBooking({ name, phone, address, date, time, issue, clientId }) {
  const jobberId = await findOrCreateClient(clientId, { name, phone, address });

  const startAt = moment.tz(`${date} ${time}`, 'YYYY-MM-DD h:mm A', TIMEZONE).toISOString();
  const endAt = moment.tz(`${date} ${time}`, 'YYYY-MM-DD h:mm A', TIMEZONE).add(2, 'hours').toISOString();

  const data = await gql(clientId, `
    mutation JobCreate($input: JobCreateInput!) {
      jobCreate(input: $input) {
        job { id jobNumber }
        userErrors { message path }
      }
    }
  `, {
    input: {
      clientId: jobberId,
      title: `Appliance Repair – ${issue}`,
      startAt,
      endAt,
    },
  });

  const errors = data?.jobCreate?.userErrors;
  if (errors?.length) throw new Error(`Jobber jobCreate: ${errors[0].message}`);

  const job = data.jobCreate.job;
  return {
    uid: `JOB-${job.jobNumber}`,
    jobId: job.id,
    jobNumber: job.jobNumber,
    jobberId,
  };
}

// ─── OAuth helper (used by /jobber/callback) ──────────────────────────────────

function seedTokenCache(clientId, accessToken, refreshToken) {
  tokenCache[clientId] = { accessToken, refreshToken };
}

module.exports = {
  getAvailableSlots,
  createBooking,
  seedTokenCache,
  AVAILABLE_SLOTS,
  TIMEZONE,
};
