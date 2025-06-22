require("dotenv").config();
const mysql = require("mysql2/promise");

// Database configurations
const sourceDbConfig = {
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  port: process.env.DATABASE_API_PORT,
};

const targetDbConfig = {
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  port: process.env.DATABASE_DATA_PORT,
};

class ETL {
  constructor() {
    this.sourceConnection = null;
    this.targetConnection = null;
    this.stats = {
      processed: {
        dates: 0,
        accounts: 0,
        tiers: 0,
        categories: 0,
        subcategories: 0,
        movementTypes: 0,
        movements: 0,
        balances: 0,
      },
      errors: [],
    };
  }

  daysBetweenInclusive(date) {
    const today = new Date();
    const pastDate = new Date(date);
    const diffTime = Math.abs(today - pastDate);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  async connectToSources() {
    try {
      console.log("🔄 Connecting to source database...");
      this.sourceConnection = await mysql.createConnection(sourceDbConfig);
      console.log("✅ Connected to source database (OLTP)");

      console.log("🔄 Connecting to target database...");
      this.targetConnection = await mysql.createConnection(targetDbConfig);
      console.log("✅ Connected to target database (OLAP)");
    } catch (error) {
      console.error("❌ Error connecting to databases:", error);
      throw error;
    }
  }

  async disconnect() {
    if (this.sourceConnection) {
      await this.sourceConnection.end();
      console.log("✅ Disconnected from source database");
    }
    if (this.targetConnection) {
      await this.targetConnection.end();
      console.log("✅ Disconnected from target database");
    }
  }

  async processDimTemps() {
    console.log("🔄 Processing time dimension...");

    try {
      // Fetch the earliest date from all the data
      const [dates] = await this.sourceConnection.query(`
                SELECT MIN(earliest_date) AS date
                FROM (
                    SELECT dateMouvement AS earliest_date
                    FROM Mouvement
                    
                    UNION ALL
                    
                    SELECT DATE(dateHeureCreation) AS earliest_date
                    FROM Compte
                ) AS all_dates;
            `);

      console.log(dates);
      const oldestDate = dates.length > 0 ? dates[0].date : null;
      console.log(`Oldest date found: ${oldestDate}`);

      if (oldestDate) {
        await this.targetConnection.query(
          `
              INSERT IGNORE INTO DimTemps (idTemps, date, jour, mois, trimestre, annee, jourSemaine)
              WITH RECURSIVE all_dates AS (
            SELECT DATE(?) AS full_date
            UNION ALL
            SELECT full_date + INTERVAL 1 DAY
            FROM all_dates
            WHERE full_date + INTERVAL 1 DAY <= ?
              )
              SELECT
            DATE_FORMAT(full_date, '%Y%m%d') AS idTemps,
            full_date AS date,
            DAY(full_date) AS jour,
            MONTH(full_date) AS mois,
            QUARTER(full_date) AS trimestre,
            YEAR(full_date) AS annee,
            CASE DAYOFWEEK(full_date)
                WHEN 1 THEN 'Dimanche'
                WHEN 2 THEN 'Lundi'
                WHEN 3 THEN 'Mardi'
                WHEN 4 THEN 'Mercredi'
                WHEN 5 THEN 'Jeudi'
                WHEN 6 THEN 'Vendredi'
                WHEN 7 THEN 'Samedi'
            END AS jourSemaine
              FROM all_dates;
              `,
          [oldestDate, new Date()]
        );
      }

      this.stats.processed.dates = this.daysBetweenInclusive(oldestDate);
      console.log(
        `✅ Processed ${this.stats.processed.dates} time dimension records`
      );
    } catch (error) {
      console.error("❌ Error processing time dimension:", error);
      this.stats.errors.push(`DimTemps: ${error.message}`);
    }
  }

  async processDimCompte() {
    console.log("🔄 Processing account dimension...");

    try {
      const [accounts] = await this.sourceConnection.query(`
                SELECT c.idCompte, c.descriptionCompte, c.nomBanque, c.idUtilisateur
                FROM Compte c
                LEFT JOIN Utilisateur u ON c.idUtilisateur = u.idUtilisateur
            `);

      if (accounts.length > 0) {
        const dimCompteData = accounts.map((account) => [
          account.idCompte,
          account.descriptionCompte,
          account.nomBanque,
          account.idUtilisateur,
        ]);

        await this.targetConnection.query(
          `
                    INSERT IGNORE INTO DimCompte (idCompte, description, nomBanque, idUtilisateur)
                    VALUES ?
                `,
          [dimCompteData]
        );
      }

      this.stats.processed.accounts = accounts.length;
      console.log(`✅ Processed ${accounts.length} account dimension records`);
    } catch (error) {
      console.error("❌ Error processing account dimension:", error);
      this.stats.errors.push(`DimCompte: ${error.message}`);
    }
  }

  // Extract and transform third party dimension
  async processDimTiers() {
    console.log("🔄 Processing third party dimension...");

    try {
      const [tiers] = await this.sourceConnection.query(`
                SELECT DISTINCT t.idTiers, t.nomTiers, u.ville, u.codePostal
                FROM Tiers t
                LEFT JOIN Utilisateur u ON t.idUtilisateur = u.idUtilisateur
            `);

      if (tiers.length > 0) {
        const dimTiersData = tiers.map((tier) => [
          tier.idTiers,
          tier.nomTiers,
          tier.ville,
          tier.codePostal,
        ]);

        await this.targetConnection.query(
          `
                    INSERT INTO DimTiers (idTiers, nomTiers, ville, codePostal)
                    VALUES ?
                    ON DUPLICATE KEY UPDATE
                        nomTiers = VALUES(nomTiers),
                        ville = VALUES(ville),
                        codePostal = VALUES(codePostal)
                `,
          [dimTiersData]
        );
      }

      this.stats.processed.tiers = tiers.length;
      console.log(`✅ Processed ${tiers.length} third party dimension records`);
    } catch (error) {
      console.error("❌ Error processing third party dimension:", error);
      this.stats.errors.push(`DimTiers: ${error.message}`);
    }
  }

  // Extract and transform category dimensions
  async processDimCategorie() {
    console.log("🔄 Processing category dimensions...");

    try {
      // Process categories
      const [categories] = await this.sourceConnection.query(`
                SELECT idCategorie, nomCategorie
                FROM Categorie
            `);

      if (categories.length > 0) {
        const dimCategorieData = categories.map((cat) => [
          cat.idCategorie,
          cat.nomCategorie,
        ]);

        await this.targetConnection.query(
          `
                    INSERT INTO DimCategorie (idCategorie, nomCategorie)
                    VALUES ?
                    ON DUPLICATE KEY UPDATE nomCategorie = VALUES(nomCategorie)
                `,
          [dimCategorieData]
        );
      }

      // Process subcategories
      const [subcategories] = await this.sourceConnection.query(`
                SELECT idSousCategorie, nomSousCategorie, idcategorie
                FROM SousCategorie
            `);

      if (subcategories.length > 0) {
        const dimSousCategorieData = subcategories.map((subcat) => [
          subcat.idSousCategorie,
          subcat.nomSousCategorie,
          subcat.idcategorie,
        ]);

        await this.targetConnection.query(
          `
                    INSERT INTO DimSousCategorie (idSousCategorie, nomSousCategorie, idCategorie)
                    VALUES ?
                    ON DUPLICATE KEY UPDATE 
                        nomSousCategorie = VALUES(nomSousCategorie),
                        idCategorie = VALUES(idCategorie)
                `,
          [dimSousCategorieData]
        );
      }

      this.stats.processed.categories = categories.length;
      this.stats.processed.subcategories = subcategories.length;
      console.log(
        `✅ Processed ${categories.length} categories and ${subcategories.length} subcategories`
      );
    } catch (error) {
      console.error("❌ Error processing category dimensions:", error);
      this.stats.errors.push(`DimCategorie: ${error.message}`);
    }
  }

  // Create movement type dimension
  async processDimTypeMouvement() {
    console.log("🔄 Processing movement type dimension...");

    try {
      const movementTypes = [
        [1, "C", "Crédit"],
        [2, "D", "Débit"],
      ];

      await this.targetConnection.query(
        `
                INSERT IGNORE INTO DimTypeMouvement (idTypeMouvement, code, libelle)
                VALUES ?
            `,
        [movementTypes]
      );

      this.stats.processed.movementTypes = movementTypes.length;
      console.log(
        `✅ Processed ${movementTypes.length} movement type dimension records`
      );
    } catch (error) {
      console.error("❌ Error processing movement type dimension:", error);
      this.stats.errors.push(`DimTypeMouvement: ${error.message}`);
    }
  }

  async processFaits() {
    console.log("🔄 Processing movement type dimension...");

    try {
      const [accountSetup] = await this.sourceConnection.query(`
          SELECT m.idCompte, MIN(m.dateMouvement) AS firstdate, c.soldeInitial
          FROM Mouvement AS m
          JOIN Compte AS c
          ON m.idCompte = c.idCompte
          GROUP BY c.idCompte
      `);

      await this.targetConnection.query(
        `
          INSERT INTO FaitSoldeCompte (idTemps, idCompte, montantSolde) VALUES ?
          `,
        [
          accountSetup.map((datas) => {
            const date = new Date(datas.firstdate);
            const idTemps =
              date.getFullYear().toString() +
              String(date.getMonth() + 1).padStart(2, "0") +
              String(date.getDate()).padStart(2, "0");
            return [idTemps, datas.idCompte, datas.soldeInitial];
          }),
        ]
      );

      // Alimente FaitMouvement
      const [movements] = await this.sourceConnection.query(`
          SELECT m.idMouvement, m.idCompte, m.dateMouvement, m
          .montant, m.idTiers, m.idSousCategorie, m.typeMouvement
          FROM Mouvement AS m
          JOIN Compte AS c ON m.idCompte = c.idCompte
      `);

      if (movements.length > 0) {
        await this.targetConnection.query(
          `
            INSERT INTO FaitMouvement (idMouvement, idTemps, idCompte, montant, idTiers, idSousCategorie, idTypeMouvement)
            VALUES ?
          `,
          [
            movements.map((movement) => {
              const date = new Date(movement.dateMouvement);
              const idTemps =
                date.getFullYear().toString() +
                String(date.getMonth() + 1).padStart(2, "0") +
                String(date.getDate()).padStart(2, "0");
              
              // Convert C/D to 1/2
              const idTypeMouvement = movement.typeMouvement === "C" ? 1 : 2;
              
              return [
                movement.idMouvement,
                idTemps,
                movement.idCompte,
                movement.montant,
                movement.idTiers,
                movement.idSousCategorie,
                idTypeMouvement,
              ];
            }),
          ]
        );
      }

      // Drop procedure if it exists first
      await this.targetConnection.query(`DROP PROCEDURE IF EXISTS calculer_soldes_journaliers`);
      
      // /!\ This may take a while
      await this.targetConnection.query(`
        CREATE PROCEDURE calculer_soldes_journaliers()
        BEGIN
            DECLARE done INT DEFAULT 0;
            DECLARE id_compte INT;
            DECLARE date_courante DATE;
            DECLARE date_creation DATE;
            DECLARE solde_prec DECIMAL(15,2);
            DECLARE mouvements_jour DECIMAL(15,2);
            DECLARE id_temps_courant INT;
            DECLARE id_temps_prec INT;

            DECLARE curseur_comptes CURSOR FOR
                SELECT idCompte FROM DimCompte;

            DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

            OPEN curseur_comptes;

            comptes_loop: LOOP
                FETCH curseur_comptes INTO id_compte;
                IF done THEN
                    LEAVE comptes_loop;
                END IF;

                -- Obtenir la date de création du compte
                SELECT t.date INTO date_creation
                FROM DimTemps t
                JOIN FaitSoldeCompte f ON f.idTemps = t.idTemps
                WHERE f.idCompte = id_compte
                ORDER BY t.date ASC
                LIMIT 1;

                -- Boucle sur les dates après la création
                SET date_courante = DATE_ADD(date_creation, INTERVAL 1 DAY);
                WHILE EXISTS (SELECT 1 FROM DimTemps WHERE date = date_courante) DO

                    -- Obtenir les idTemps
                    SELECT idTemps INTO id_temps_courant FROM DimTemps WHERE date = date_courante;
                    SELECT idTemps INTO id_temps_prec FROM DimTemps WHERE date = DATE_SUB(date_courante, INTERVAL 1 DAY);

                    -- Récupérer le solde de la veille
                    SELECT montantSolde INTO solde_prec
                    FROM FaitSoldeCompte
                    WHERE idCompte = id_compte AND idTemps = id_temps_prec;

                    -- Calcul des mouvements du jour avec le signe selon DimTypeMouvement
                    SELECT IFNULL(SUM(
                        CASE 
                            WHEN dtm.code = 'C' THEN fm.montant  -- Crédit (positif)
                            WHEN dtm.code = 'D' THEN -fm.montant -- Débit (négatif)
                            ELSE 0
                        END
                    ), 0)
                    INTO mouvements_jour
                    FROM FaitMouvement fm
                    JOIN DimTypeMouvement dtm ON fm.idTypeMouvement = dtm.idTypeMouvement
                    WHERE fm.idCompte = id_compte AND fm.idTemps = id_temps_courant;

                    -- Insertion du solde du jour
                    INSERT INTO FaitSoldeCompte(idTemps, idCompte, montantSolde)
                    VALUES (id_temps_courant, id_compte, solde_prec + mouvements_jour);

                    SET date_courante = DATE_ADD(date_courante, INTERVAL 1 DAY);
                END WHILE;
            END LOOP;

            CLOSE curseur_comptes;
        END
      `);

      // Call the stored procedure (optional)
      await this.targetConnection.query(`CALL calculer_soldes_journaliers()`);

      console.log("✅ Processed facts and created stored procedure");

    } catch (error) {
      console.error("❌ Error processing facts:", error);
      this.stats.errors.push(`FaitMouvement: ${error.message}`);
    }
  }
  // Utility functions
  getDayOfWeek(dayNum) {
    const days = [
      "Dimanche",
      "Lundi",
      "Mardi",
      "Mercredi",
      "Jeudi",
      "Vendredi",
      "Samedi",
    ];
    return days[dayNum];
  }

  getDayName(dayNum) {
    const days = [
      "Dimanche",
      "Lundi",
      "Mardi",
      "Mercredi",
      "Jeudi",
      "Vendredi",
      "Samedi",
    ];
    return days[dayNum];
  }

  getMonthName(monthNum) {
    const months = [
      "Janvier",
      "Février",
      "Mars",
      "Avril",
      "Mai",
      "Juin",
      "Juillet",
      "Août",
      "Septembre",
      "Octobre",
      "Novembre",
      "Décembre",
    ];
    return months[monthNum];
  }

  getWeekOfYear(date) {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  // Main ETL process
  async runETL() {
    console.log("🚀 Starting ETL process...");
    const startTime = Date.now();

    try {
      await this.connectToSources();

      await this.processDimTemps();
      await this.processDimCompte();
      await this.processDimTiers();
      await this.processDimCategorie();
      await this.processDimTypeMouvement();

      // Process facts
      // await this.processFaitMouvement();
      await this.processFaits();

      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;

      console.log("\n🎉 ETL process completed successfully!");
      console.log(`⏱️ Total execution time: ${duration.toFixed(2)} seconds`);

      this.printSummary();
    } catch (error) {
      console.error("❌ ETL process failed:", error);
      throw error;
    } finally {
      await this.disconnect();
    }
  }

  printSummary() {
    console.log("\n📊 ETL Summary:");
    console.log("================");
    console.log(`📅 Time dimension records: ${this.stats.processed.dates}`);
    console.log(
      `🏦 Account dimension records: ${this.stats.processed.accounts}`
    );
    console.log(
      `👥 Third party dimension records: ${this.stats.processed.tiers}`
    );
    console.log(
      `📁 Category dimension records: ${this.stats.processed.categories}`
    );
    console.log(
      `📂 Subcategory dimension records: ${this.stats.processed.subcategories}`
    );
    console.log(
      `🔄 Movement type dimension records: ${this.stats.processed.movementTypes}`
    );
    console.log(`💰 Movement fact records: ${this.stats.processed.movements}`);
    console.log(`💳 Balance fact records: ${this.stats.processed.balances}`);

    if (this.stats.errors.length > 0) {
      console.log("\n⚠️ Errors encountered:");
      this.stats.errors.forEach((error) => console.log(`  - ${error}`));
    }
  }
}

// Main execution
async function main() {
  const etl = new ETL();

  try {
    await etl.runETL();
    console.log("✅ ETL process completed successfully");
    process.exit(0);
  } catch (error) {
    console.error("❌ ETL process failed:", error);
    process.exit(1);
  }
}

// Run the ETL
if (require.main === module) {
  main();
}

module.exports = ETL;
