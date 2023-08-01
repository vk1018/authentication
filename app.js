const express = require("express");
const app = express();
app.use(express.json());
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const dbPath = path.join(__dirname, "covid19IndiaPortal.db");
let db = null;
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("sever running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DBError:${e.message}`);
    process.exit(1);
  }
};
initializeDbAndServer();
const convertStateObjectToResponseObject = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  };
};
const convertDistrictObjectToResponseObject = (dbObject) => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  };
};

const authenticationToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `
SELECT *
FROM user
WHERE
username='${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/states/", authenticationToken, async (request, response) => {
  const stateNames = `
    SELECT *
    FROM state`;
  const allStateArray = await db.all(stateNames);
  response.send(
    allStateArray.map((eachObject) =>
      convertStateObjectToResponseObject(eachObject)
    )
  );
});

app.get("/states/:stateId/", authenticationToken, async (request, response) => {
  const { stateId } = request.params;
  const stateQuery = `
    SELECT *
    FROM state
    WHERE state_id=${stateId}`;
  const stateDetails = await db.get(stateQuery);
  response.send(convertStateObjectToResponseObject(stateDetails));
});

app.post("/districts/", authenticationToken, async (request, response) => {
  const newDistrict = request.body;
  const { districtName, stateId, cases, cured, active, deaths } = newDistrict;
  const addingNewDistrict = `
INSERT INTO
district(district_name,
    state_id,
    cases,
    cured,
    active,
    deaths)
    VALUES(
        '${districtName}',
        ${stateId},
        '${cases}',
        '${cured}',
       '${active}',
        '${deaths}'
    )`;
  const dbResponse = await db.run(addingNewDistrict);
  const newDistrictDetails = dbResponse.lastID;
  response.send("District Successfully Added");
});

app.get(
  "/districts/:districtId/",
  authenticationToken,
  async (request, response) => {
    const { districtId } = request.params;
    const districtDetails = `
SELECT *
FROM 
district
WHERE
district_id=${districtId}`;
    const districtArray = await db.get(districtDetails);
    response.send(convertDistrictObjectToResponseObject(districtArray));
  }
);
app.delete(
  "/districts/:districtId/",
  authenticationToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrict = `
DELETE FROM
district
WHERE
district_id =${districtId}`;
    await db.run(deleteDistrict);
    response.send("District Removed");
  }
);

app.put(
  "/districts/:districtId/",
  authenticationToken,
  async (request, response) => {
    const { districtId } = request.params;
    const districtDetails = request.body;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = districtDetails;
    const updateDistrictDetails = `
    UPDATE district
    SET
    district_name='${districtName}',
    state_id='${stateId}',
    cases='${cases}',
    cured='${cured}',
    active='${active}',
    deaths='${deaths}'
    WHERE district_id=${districtId}`;
    await db.run(updateDistrictDetails);
    response.send("District Details Updated");
  }
);
app.get(
  "/states/:stateId/stats/",
  authenticationToken,
  async (request, response) => {
    const { stateId } = request.params;
    const stateQuery = `
    SELECT
    SUM(cases),
    SUM(cured),
    SUM(active),
    SUM(deaths)
    FROM district
    WHERE state_id=${stateId}`;
    const stateDetails = await db.get(stateQuery);
    response.send({
      totalCases: stateDetails["SUM(cases)"],
      totalCured: stateDetails["SUM(cured)"],
      totalActive: stateDetails["SUM(active)"],
      totalDeaths: stateDetails["SUM(deaths)"],
    });
  }
);

module.exports = app;
