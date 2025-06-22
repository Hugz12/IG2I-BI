require('dotenv').config();
const mysql = require('mysql2/promise');

// Database configurations
const sourceDbConfig = {
    host: process.env.DATABASE_HOST,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    port: process.env.DATABASE_API_PORT
};

const targetDbConfig = {
    host: process.env.DATABASE_HOST,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    port: process.env.DATABASE_DATA_PORT
};

class FinancialETL {
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
                balances: 0
            },
            errors: []
        };
    }

    async connectToSources() {
        try {
            console.log('🔄 Connecting to source database...');
            this.sourceConnection = await mysql.createConnection(sourceDbConfig);
            console.log('✅ Connected to source database (OLTP)');

            console.log('🔄 Connecting to target database...');
            this.targetConnection = await mysql.createConnection(targetDbConfig);
            console.log('✅ Connected to target database (OLAP)');
        } catch (error) {
            console.error('❌ Error connecting to databases:', error);
            throw error;
        }
    }

    async disconnect() {
        if (this.sourceConnection) {
            await this.sourceConnection.end();
            console.log('✅ Disconnected from source database');
        }
        if (this.targetConnection) {
            await this.targetConnection.end();
            console.log('✅ Disconnected from target database');
        }
    }

    // Create the dimensional model schema
    async createDimensionalSchema() {
        console.log('🔄 Creating dimensional model schema...');
        
        const createSchemaSQL = `
        -- Drop existing tables if they exist
        DROP TABLE IF EXISTS FaitMouvement;
        DROP TABLE IF EXISTS FaitSoldeCompte;
        DROP TABLE IF EXISTS DimTypeMouvement;
        DROP TABLE IF EXISTS DimSousCategorie;
        DROP TABLE IF EXISTS DimCategorie;
        DROP TABLE IF EXISTS DimTiers;
        DROP TABLE IF EXISTS DimCompte;
        DROP TABLE IF EXISTS DimTemps;

        -- Create DimTemps (Time Dimension) table
        CREATE TABLE DimTemps (
            idTemps INT PRIMARY KEY,
            date DATE NOT NULL,
            jour INT NOT NULL,
            mois INT NOT NULL,
            trimestre INT NOT NULL,
            annee INT NOT NULL,
            jourSemaine VARCHAR(20),
            nomMois VARCHAR(20),
            nomJourSemaine VARCHAR(20),
            semaineAnnee INT,
            estWeekend BOOLEAN DEFAULT FALSE,
            estJourFerie BOOLEAN DEFAULT FALSE
        );

        -- Create DimCompte (Account Dimension) table
        CREATE TABLE DimCompte (
            idCompte INT PRIMARY KEY,
            description VARCHAR(255),
            nomBanque VARCHAR(100),
            idUtilisateur INT,
            nomUtilisateur VARCHAR(100),
            prenomUtilisateur VARCHAR(100),
            villeUtilisateur VARCHAR(100),
            codePostalUtilisateur CHAR(10),
            soldeInitial DECIMAL(15,2)
        );

        -- Create DimTiers (Third Party Dimension) table
        CREATE TABLE DimTiers (
            idTiers INT PRIMARY KEY,
            nomTiers VARCHAR(100),
            ville VARCHAR(100),
            codePostal CHAR(10)
        );

        -- Create DimCategorie (Category Dimension) table
        CREATE TABLE DimCategorie (
            idCategorie INT PRIMARY KEY,
            nomCategorie VARCHAR(100)
        );

        -- Create DimSousCategorie (Subcategory Dimension) table
        CREATE TABLE DimSousCategorie (
            idSousCategorie INT PRIMARY KEY,
            nomSousCategorie VARCHAR(100),
            idCategorie INT,
            FOREIGN KEY (idCategorie) REFERENCES DimCategorie(idCategorie)
        );

        -- Create DimTypeMouvement (Movement Type Dimension) table
        CREATE TABLE DimTypeMouvement (
            idTypeMouvement INT PRIMARY KEY,
            code CHAR(10),
            libelle VARCHAR(100)
        );

        -- Create FaitMouvement (Movement Fact) table
        CREATE TABLE FaitMouvement (
            idMouvement INT PRIMARY KEY,
            idTemps INT NOT NULL,
            idCompte INT NOT NULL,
            idTiers INT,
            idCategorie INT,
            idSousCategorie INT,
            idTypeMouvement INT,
            montant DECIMAL(15,2) NOT NULL,
            idVirement INT,
            dateHeureCreation TIMESTAMP,
            FOREIGN KEY (idTemps) REFERENCES DimTemps(idTemps),
            FOREIGN KEY (idCompte) REFERENCES DimCompte(idCompte),
            FOREIGN KEY (idTiers) REFERENCES DimTiers(idTiers),
            FOREIGN KEY (idCategorie) REFERENCES DimCategorie(idCategorie),
            FOREIGN KEY (idSousCategorie) REFERENCES DimSousCategorie(idSousCategorie),
            FOREIGN KEY (idTypeMouvement) REFERENCES DimTypeMouvement(idTypeMouvement)
        );

        -- Create FaitSoldeCompte (Account Balance Fact) table
        CREATE TABLE FaitSoldeCompte (
            idSolde INT AUTO_INCREMENT PRIMARY KEY,
            idTemps INT NOT NULL,
            idCompte INT NOT NULL,
            montantSolde DECIMAL(15,2) NOT NULL,
            FOREIGN KEY (idTemps) REFERENCES DimTemps(idTemps),
            FOREIGN KEY (idCompte) REFERENCES DimCompte(idCompte)
        );

        -- Create indexes for performance
        CREATE INDEX idx_faitmouvement_temps ON FaitMouvement(idTemps);
        CREATE INDEX idx_faitmouvement_compte ON FaitMouvement(idCompte);
        CREATE INDEX idx_faitmouvement_categorie ON FaitMouvement(idCategorie);
        CREATE INDEX idx_faitmouvement_souscategorie ON FaitMouvement(idSousCategorie);
        CREATE INDEX idx_faitmouvement_tiers ON FaitMouvement(idTiers);
        CREATE INDEX idx_faitmouvement_typemouvement ON FaitMouvement(idTypeMouvement);
        CREATE INDEX idx_faitsoldecompte_temps ON FaitSoldeCompte(idTemps);
        CREATE INDEX idx_faitsoldecompte_compte ON FaitSoldeCompte(idCompte);
        CREATE INDEX idx_dimsouscategorie_categorie ON DimSousCategorie(idCategorie);
        `;

        const statements = createSchemaSQL.split(';').filter(stmt => stmt.trim());
        for (const statement of statements) {
            if (statement.trim()) {
                await this.targetConnection.query(statement);
            }
        }
        
        console.log('✅ Dimensional model schema created');
    }

    // Extract and transform time dimension
    async processDimTemps() {
        console.log('🔄 Processing time dimension...');
        
        try {
            // Get all unique dates from movements
            const [dates] = await this.sourceConnection.query(`
                SELECT DISTINCT dateMouvement as date 
                FROM Mouvement 
                ORDER BY dateMouvement
            `);

            if (dates.length === 0) {
                console.log('⚠️ No dates found in source data');
                return;
            }

            const dimTempsData = dates.map(row => {
                const date = new Date(row.date);
                const idTemps = parseInt(date.toISOString().split('T')[0].replace(/-/g, ''));
                
                return [
                    idTemps, // idTemps (YYYYMMDD format)
                    row.date, // date
                    date.getDate(), // jour
                    date.getMonth() + 1, // mois
                    Math.ceil((date.getMonth() + 1) / 3), // trimestre
                    date.getFullYear(), // annee
                    this.getDayOfWeek(date.getDay()), // jourSemaine
                    this.getMonthName(date.getMonth()), // nomMois
                    this.getDayName(date.getDay()), // nomJourSemaine
                    this.getWeekOfYear(date), // semaineAnnee
                    date.getDay() === 0 || date.getDay() === 6, // estWeekend
                    false // estJourFerie (could be enhanced with holiday logic)
                ];
            });

            if (dimTempsData.length > 0) {
                await this.targetConnection.query(`
                    INSERT INTO DimTemps (idTemps, date, jour, mois, trimestre, annee, jourSemaine, 
                                         nomMois, nomJourSemaine, semaineAnnee, estWeekend, estJourFerie)
                    VALUES ?
                    ON DUPLICATE KEY UPDATE
                        date = VALUES(date),
                        jour = VALUES(jour),
                        mois = VALUES(mois),
                        trimestre = VALUES(trimestre),
                        annee = VALUES(annee)
                `, [dimTempsData]);
            }

            this.stats.processed.dates = dimTempsData.length;
            console.log(`✅ Processed ${dimTempsData.length} time dimension records`);
        } catch (error) {
            console.error('❌ Error processing time dimension:', error);
            this.stats.errors.push(`DimTemps: ${error.message}`);
        }
    }

    // Extract and transform account dimension
    async processDimCompte() {
        console.log('🔄 Processing account dimension...');
        
        try {
            const [accounts] = await this.sourceConnection.query(`
                SELECT c.idCompte, c.descriptionCompte, c.nomBanque, c.idUtilisateur, c.soldeInitial,
                       u.nomUtilisateur, u.prenomUtilisateur, u.ville, u.codePostal
                FROM Compte c
                LEFT JOIN Utilisateur u ON c.idUtilisateur = u.idUtilisateur
            `);

            if (accounts.length > 0) {
                const dimCompteData = accounts.map(account => [
                    account.idCompte,
                    account.descriptionCompte,
                    account.nomBanque,
                    account.idUtilisateur,
                    account.nomUtilisateur,
                    account.prenomUtilisateur,
                    account.ville,
                    account.codePostal,
                    account.soldeInitial
                ]);

                await this.targetConnection.query(`
                    INSERT INTO DimCompte (idCompte, description, nomBanque, idUtilisateur, 
                                          nomUtilisateur, prenomUtilisateur, villeUtilisateur, 
                                          codePostalUtilisateur, soldeInitial)
                    VALUES ?
                    ON DUPLICATE KEY UPDATE
                        description = VALUES(description),
                        nomBanque = VALUES(nomBanque),
                        nomUtilisateur = VALUES(nomUtilisateur)
                `, [dimCompteData]);
            }

            this.stats.processed.accounts = accounts.length;
            console.log(`✅ Processed ${accounts.length} account dimension records`);
        } catch (error) {
            console.error('❌ Error processing account dimension:', error);
            this.stats.errors.push(`DimCompte: ${error.message}`);
        }
    }

    // Extract and transform third party dimension
    async processDimTiers() {
        console.log('🔄 Processing third party dimension...');
        
        try {
            const [tiers] = await this.sourceConnection.query(`
                SELECT DISTINCT t.idTiers, t.nomTiers, u.ville, u.codePostal
                FROM Tiers t
                LEFT JOIN Utilisateur u ON t.idUtilisateur = u.idUtilisateur
            `);

            if (tiers.length > 0) {
                const dimTiersData = tiers.map(tier => [
                    tier.idTiers,
                    tier.nomTiers,
                    tier.ville,
                    tier.codePostal
                ]);

                await this.targetConnection.query(`
                    INSERT INTO DimTiers (idTiers, nomTiers, ville, codePostal)
                    VALUES ?
                    ON DUPLICATE KEY UPDATE
                        nomTiers = VALUES(nomTiers),
                        ville = VALUES(ville),
                        codePostal = VALUES(codePostal)
                `, [dimTiersData]);
            }

            this.stats.processed.tiers = tiers.length;
            console.log(`✅ Processed ${tiers.length} third party dimension records`);
        } catch (error) {
            console.error('❌ Error processing third party dimension:', error);
            this.stats.errors.push(`DimTiers: ${error.message}`);
        }
    }

    // Extract and transform category dimensions
    async processDimCategorie() {
        console.log('🔄 Processing category dimensions...');
        
        try {
            // Process categories
            const [categories] = await this.sourceConnection.query(`
                SELECT idCategorie, nomCategorie
                FROM Categorie
            `);

            if (categories.length > 0) {
                const dimCategorieData = categories.map(cat => [cat.idCategorie, cat.nomCategorie]);
                
                await this.targetConnection.query(`
                    INSERT INTO DimCategorie (idCategorie, nomCategorie)
                    VALUES ?
                    ON DUPLICATE KEY UPDATE nomCategorie = VALUES(nomCategorie)
                `, [dimCategorieData]);
            }

            // Process subcategories
            const [subcategories] = await this.sourceConnection.query(`
                SELECT idSousCategorie, nomSousCategorie, idcategorie
                FROM SousCategorie
            `);

            if (subcategories.length > 0) {
                const dimSousCategorieData = subcategories.map(subcat => [
                    subcat.idSousCategorie, 
                    subcat.nomSousCategorie, 
                    subcat.idcategorie
                ]);
                
                await this.targetConnection.query(`
                    INSERT INTO DimSousCategorie (idSousCategorie, nomSousCategorie, idCategorie)
                    VALUES ?
                    ON DUPLICATE KEY UPDATE 
                        nomSousCategorie = VALUES(nomSousCategorie),
                        idCategorie = VALUES(idCategorie)
                `, [dimSousCategorieData]);
            }

            this.stats.processed.categories = categories.length;
            this.stats.processed.subcategories = subcategories.length;
            console.log(`✅ Processed ${categories.length} categories and ${subcategories.length} subcategories`);
        } catch (error) {
            console.error('❌ Error processing category dimensions:', error);
            this.stats.errors.push(`DimCategorie: ${error.message}`);
        }
    }

    // Create movement type dimension
    async processDimTypeMouvement() {
        console.log('🔄 Processing movement type dimension...');
        
        try {
            const movementTypes = [
                [1, 'C', 'Crédit'],
                [2, 'D', 'Débit']
            ];

            await this.targetConnection.query(`
                INSERT INTO DimTypeMouvement (idTypeMouvement, code, libelle)
                VALUES ?
                ON DUPLICATE KEY UPDATE 
                    code = VALUES(code),
                    libelle = VALUES(libelle)
            `, [movementTypes]);

            this.stats.processed.movementTypes = movementTypes.length;
            console.log(`✅ Processed ${movementTypes.length} movement type dimension records`);
        } catch (error) {
            console.error('❌ Error processing movement type dimension:', error);
            this.stats.errors.push(`DimTypeMouvement: ${error.message}`);
        }
    }

    // Extract and transform movement facts
    async processFaitMouvement() {
        console.log('🔄 Processing movement facts...');
        
        try {
            const [movements] = await this.sourceConnection.query(`
                SELECT m.idMouvement, m.dateMouvement, m.idCompte, m.idTiers, 
                       m.idCategorie, m.idSousCategorie, m.montant, m.typeMouvement,
                       m.idVirement, m.dateHeureCreation
                FROM Mouvement m
                ORDER BY m.dateMouvement, m.idMouvement
            `);

            if (movements.length === 0) {
                console.log('⚠️ No movements found in source data');
                return;
            }

            const batchSize = 1000;
            let processedCount = 0;

            for (let i = 0; i < movements.length; i += batchSize) {
                const batch = movements.slice(i, i + batchSize);
                
                const faitMouvementData = batch.map(movement => {
                    const date = new Date(movement.dateMouvement);
                    const idTemps = parseInt(date.toISOString().split('T')[0].replace(/-/g, ''));
                    const idTypeMouvement = movement.typeMouvement === 'C' ? 1 : 2;
                    
                    return [
                        movement.idMouvement,
                        idTemps,
                        movement.idCompte,
                        movement.idTiers,
                        movement.idCategorie,
                        movement.idSousCategorie,
                        idTypeMouvement,
                        movement.montant,
                        movement.idVirement,
                        movement.dateHeureCreation
                    ];
                });

                await this.targetConnection.query(`
                    INSERT INTO FaitMouvement (idMouvement, idTemps, idCompte, idTiers, idCategorie, 
                                              idSousCategorie, idTypeMouvement, montant, idVirement, dateHeureCreation)
                    VALUES ?
                    ON DUPLICATE KEY UPDATE
                        montant = VALUES(montant),
                        idTypeMouvement = VALUES(idTypeMouvement)
                `, [faitMouvementData]);

                processedCount += batch.length;
                console.log(`🔄 Processed ${processedCount}/${movements.length} movements...`);
            }

            this.stats.processed.movements = movements.length;
            console.log(`✅ Processed ${movements.length} movement facts`);
        } catch (error) {
            console.error('❌ Error processing movement facts:', error);
            this.stats.errors.push(`FaitMouvement: ${error.message}`);
        }
    }

    // Generate account balance snapshots
    async processFaitSoldeCompte() {
        console.log('🔄 Processing account balance facts...');
        
        try {
            // Get all accounts and dates combination for balance calculation
            const [balanceData] = await this.targetConnection.query(`
                SELECT DISTINCT 
                    dt.idTemps,
                    dt.date,
                    dc.idCompte,
                    dc.soldeInitial
                FROM DimTemps dt
                CROSS JOIN DimCompte dc
                ORDER BY dc.idCompte, dt.date
            `);

            const batchSize = 1000;
            let processedCount = 0;
            const balanceInserts = [];

            // Calculate running balance for each account
            const accountBalances = new Map();

            for (const row of balanceData) {
                const accountId = row.idCompte;
                const currentDate = row.date;
                const idTemps = row.idTemps;

                // Initialize account balance if not exists
                if (!accountBalances.has(accountId)) {
                    accountBalances.set(accountId, row.soldeInitial);
                }

                // Get movements for this account up to this date
                const [movements] = await this.targetConnection.query(`
                    SELECT SUM(montant) as totalMouvement
                    FROM FaitMouvement fm
                    INNER JOIN DimTemps dt ON fm.idTemps = dt.idTemps
                    WHERE fm.idCompte = ? AND dt.date <= ?
                `, [accountId, currentDate]);

                const totalMovement = movements[0].totalMouvement || 0;
                const currentBalance = row.soldeInitial + totalMovement;

                balanceInserts.push([idTemps, accountId, currentBalance]);

                if (balanceInserts.length >= batchSize) {
                    await this.targetConnection.query(`
                        INSERT INTO FaitSoldeCompte (idTemps, idCompte, montantSolde)
                        VALUES ?
                        ON DUPLICATE KEY UPDATE montantSolde = VALUES(montantSolde)
                    `, [balanceInserts]);
                    
                    processedCount += balanceInserts.length;
                    console.log(`🔄 Processed ${processedCount} balance records...`);
                    balanceInserts.length = 0; // Clear array
                }
            }

            // Insert remaining balances
            if (balanceInserts.length > 0) {
                await this.targetConnection.query(`
                    INSERT INTO FaitSoldeCompte (idTemps, idCompte, montantSolde)
                    VALUES ?
                    ON DUPLICATE KEY UPDATE montantSolde = VALUES(montantSolde)
                `, [balanceInserts]);
                processedCount += balanceInserts.length;
            }

            this.stats.processed.balances = processedCount;
            console.log(`✅ Processed ${processedCount} balance facts`);
        } catch (error) {
            console.error('❌ Error processing balance facts:', error);
            this.stats.errors.push(`FaitSoldeCompte: ${error.message}`);
        }
    }

    // Utility functions
    getDayOfWeek(dayNum) {
        const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
        return days[dayNum];
    }

    getDayName(dayNum) {
        const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
        return days[dayNum];
    }

    getMonthName(monthNum) {
        const months = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                       'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
        return months[monthNum];
    }

    getWeekOfYear(date) {
        const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
        const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
        return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
    }

    // Main ETL process
    async runETL() {
        console.log('🚀 Starting ETL process...');
        const startTime = Date.now();

        try {
            await this.connectToSources();
            await this.createDimensionalSchema();
            
            // Process dimensions first
            await this.processDimTemps();
            await this.processDimCompte();
            await this.processDimTiers();
            await this.processDimCategorie();
            await this.processDimTypeMouvement();
            
            // Process facts
            await this.processFaitMouvement();
            await this.processFaitSoldeCompte();

            const endTime = Date.now();
            const duration = (endTime - startTime) / 1000;

            console.log('\n🎉 ETL process completed successfully!');
            console.log(`⏱️ Total execution time: ${duration.toFixed(2)} seconds`);
            
            this.printSummary();

        } catch (error) {
            console.error('❌ ETL process failed:', error);
            throw error;
        } finally {
            await this.disconnect();
        }
    }

    printSummary() {
        console.log('\n📊 ETL Summary:');
        console.log('================');
        console.log(`📅 Time dimension records: ${this.stats.processed.dates}`);
        console.log(`🏦 Account dimension records: ${this.stats.processed.accounts}`);
        console.log(`👥 Third party dimension records: ${this.stats.processed.tiers}`);
        console.log(`📁 Category dimension records: ${this.stats.processed.categories}`);
        console.log(`📂 Subcategory dimension records: ${this.stats.processed.subcategories}`);
        console.log(`🔄 Movement type dimension records: ${this.stats.processed.movementTypes}`);
        console.log(`💰 Movement fact records: ${this.stats.processed.movements}`);
        console.log(`💳 Balance fact records: ${this.stats.processed.balances}`);
        
        if (this.stats.errors.length > 0) {
            console.log('\n⚠️ Errors encountered:');
            this.stats.errors.forEach(error => console.log(`  - ${error}`));
        }
    }
}

// Main execution
async function main() {
    const etl = new FinancialETL();
    
    try {
        await etl.runETL();
        console.log('✅ ETL process completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('❌ ETL process failed:', error);
        process.exit(1);
    }
}

// Run the ETL
if (require.main === module) {
    main();
}

module.exports = FinancialETL;