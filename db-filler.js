require('dotenv').config();
const mysql = require('mysql2/promise');
const { faker } = require('@faker-js/faker');
const { randomBytes, scryptSync } = require('crypto');

// Generate a secure hash for passwords
function hashPassword(password) {
    const salt = randomBytes(16).toString("hex"); // Sel aléatoire
    const hash = scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${hash}`;
}

// Database configuration
const dbConfig = {
    host: process.env.DATABASE_HOST,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    port: process.env.DATABASE_PORT
};

// Realistic banking categories and subcategories
const categoriesData = [
    {
        name: 'Alimentation',
        subcategories: ['Supermarché', 'Restaurant', 'Boulangerie', 'Fast-food', 'Épicerie']
    },
    {
        name: 'Transport',
        subcategories: ['Essence', 'Transport public', 'Taxi/Uber', 'Parking', 'Péage']
    },
    {
        name: 'Logement',
        subcategories: ['Loyer', 'Électricité', 'Gaz', 'Eau', 'Internet', 'Assurance habitation']
    },
    {
        name: 'Santé',
        subcategories: ['Médecin', 'Pharmacie', 'Dentiste', 'Mutuelle', 'Optique']
    },
    {
        name: 'Loisirs',
        subcategories: ['Cinéma', 'Sport', 'Livres', 'Sorties', 'Voyage']
    },
    {
        name: 'Revenus',
        subcategories: ['Salaire', 'Freelance', 'Investissements', 'Remboursements', 'Prime']
    },
    {
        name: 'Banque',
        subcategories: ['Frais bancaires', 'Intérêts', 'Virement', 'Prélèvement', 'Commission']
    },
    {
        name: 'Shopping',
        subcategories: ['Vêtements', 'Électronique', 'Maison', 'Cadeaux', 'Beauté']
    }
];

const technicalUser = {
    nomUtilisateur: "Laloy",
    prenomUtilisateur: "Hugo",
    login: "hugo.laloy@mail.com",
    mdp: hashPassword("password123"),
    ville: "Lens",
    codePostal: "62300",
}

// French bank names
const bankNames = [
    'BNP Paribas', 'Crédit Agricole', 'Société Générale', 'LCL', 'Crédit Mutuel',
    'Banque Populaire', 'Caisse d\'Épargne', 'La Banque Postale', 'CIC', 'HSBC'
];

// Common French third parties for banking
const commonTiers = [
    'AMAZON', 'FNAC', 'CARREFOUR', 'AUCHAN', 'LECLERC',
    'SNCF', 'EDF', 'ORANGE', 'SFR', 'FREE',
    'SHELL', 'TOTAL', 'BP', 'ESSO',
    'MCDONALD\'S', 'KFC', 'BURGER KING',
    'DECATHLON', 'ZARA', 'H&M',
    'PHARMACIE', 'DOCTOLIB',
    'CINEMA PATHE', 'SPOTIFY', 'NETFLIX'
];

class BankDataGenerator {
    constructor() {
        this.connection = null;
        this.categories = [];
        this.subcategories = [];
        this.users = [];
        this.accounts = [];
        this.tiers = [];
    }

    async connect() {
        try {
            this.connection = await mysql.createConnection(dbConfig);
            console.log('✅ Connected to MySQL database');
        } catch (error) {
            console.error('❌ Error connecting to database:', error);
            throw error;
        }
    }

    async disconnect() {
        if (this.connection) {
            await this.connection.end();
            console.log('✅ Disconnected from database');
        }
    }

    // Generate users
    async generateUsers(count = 50) {
        console.log(`🔄 Generating ${count} users...`);
        const users = [];

        users.push(technicalUser);

        for (let i = 0; i < count; i++) {
            const firstName = faker.person.firstName();
            const lastName = faker.person.lastName();
            const user = {
                nomUtilisateur: lastName,
                prenomUtilisateur: firstName,
                login: faker.internet.email({ firstName, lastName }),
                mdp: hashPassword(faker.internet.password()),
                ville: faker.location.city(),
                codePostal: faker.location.zipCode('####0')
            };
            users.push(user);
        }

        const insertQuery = `
            INSERT INTO Utilisateur (nomUtilisateur, prenomUtilisateur, login, mdp, hashcode, ville, codePostal)
            VALUES ?
        `;
        
        const values = users.map(user => [
            user.nomUtilisateur, user.prenomUtilisateur, user.login,
            user.mdp, user.hashcode, user.ville, user.codePostal
        ]);

        await this.connection.query(insertQuery, [values]);
        
        // Fetch generated users with their IDs
        const [rows] = await this.connection.query('SELECT * FROM Utilisateur');
        this.users = rows;
        console.log(`✅ Generated ${count} users`);
    }

    // Generate categories and subcategories
    async generateCategories() {
        console.log('🔄 Generating categories and subcategories...');

        for (const categoryData of categoriesData) {
            // Insert category
            const [categoryResult] = await this.connection.query(
                'INSERT INTO Categorie (nomCategorie) VALUES (?)',
                [categoryData.name]
            );
            
            const categoryId = categoryResult.insertId;
            this.categories.push({ id: categoryId, name: categoryData.name });

            // Insert subcategories
            for (const subCatName of categoryData.subcategories) {
                const [subCatResult] = await this.connection.query(
                    'INSERT INTO SousCategorie (nomSousCategorie, idcategorie) VALUES (?, ?)',
                    [subCatName, categoryId]
                );
                
                this.subcategories.push({
                    id: subCatResult.insertId,
                    name: subCatName,
                    categoryId: categoryId
                });
            }
        }

        console.log(`✅ Generated ${this.categories.length} categories and ${this.subcategories.length} subcategories`);
    }

    // Generate third parties
    async generateTiers(count = 100) {
        console.log(`🔄 Generating ${count} third parties...`);
        const tiers = [];

        // Add common third parties
        for (const tierName of commonTiers) {
            tiers.push({
                nomTiers: tierName.substring(0, 50), // Truncate to 50 characters to match VARCHAR(50)
                idUtilisateur: faker.helpers.arrayElement(this.users).idUtilisateur
            });
        }

        // Add additional random third parties
        const remainingCount = count - commonTiers.length;
        for (let i = 0; i < remainingCount; i++) {
            const tierName = faker.helpers.arrayElement([
                faker.company.name(),
                `${faker.person.lastName()} ${faker.person.firstName()}`,
                `Magasin ${faker.location.city()}`,
                `Restaurant ${faker.food.dish()}`,
                `Service ${faker.commerce.department()}`
            ]).substring(0, 50); // Truncate to 50 characters to match VARCHAR(50)

            tiers.push({
                nomTiers: tierName,
                idUtilisateur: faker.helpers.arrayElement(this.users).idUtilisateur
            });
        }

        const insertQuery = 'INSERT INTO Tiers (nomTiers, idUtilisateur) VALUES ?';
        const values = tiers.map(tier => [tier.nomTiers, tier.idUtilisateur]);

        await this.connection.query(insertQuery, [values]);

        // Fetch generated tiers with their IDs
        const [rows] = await this.connection.query('SELECT * FROM Tiers');
        this.tiers = rows;
        console.log(`✅ Generated ${count} third parties`);
    }

    // Generate accounts
    async generateAccounts(accountsPerUser = 2) {
        console.log(`🔄 Generating accounts (${accountsPerUser} per user)...`);
        const accounts = [];

        for (const user of this.users) {
            for (let i = 0; i < accountsPerUser; i++) {
                const accountTypes = ['Compte Courant', 'Livret A', 'PEL', 'Compte Épargne', 'Compte Joint'];
                const soldeInitial = faker.number.float({ min: 100, max: 9999.99, multipleOf: 0.01 });
                
                const account = {
                    descriptionCompte: faker.helpers.arrayElement(accountTypes),
                    nomBanque: faker.helpers.arrayElement(bankNames),
                    idUtilisateur: user.idUtilisateur,
                    soldeInitial: soldeInitial,
                    dernierSolde: soldeInitial
                };
                accounts.push(account);
            }
        }

        const insertQuery = `
            INSERT INTO Compte (descriptionCompte, nomBanque, idUtilisateur, soldeInitial, dernierSolde)
            VALUES ?
        `;
        
        const values = accounts.map(account => [
            account.descriptionCompte, account.nomBanque, account.idUtilisateur,
            account.soldeInitial, account.dernierSolde
        ]);

        await this.connection.query(insertQuery, [values]);

        // Fetch generated accounts with their IDs
        const [rows] = await this.connection.query('SELECT * FROM Compte');
        this.accounts = rows;
        console.log(`✅ Generated ${this.accounts.length} accounts`);
    }

    // Generate movements
    async generateMovements(count = 2000) {
        console.log(`🔄 Generating ${count} movements...`);
        const movements = [];

        for (let i = 0; i < count; i++) {
            const account = faker.helpers.arrayElement(this.accounts);
            const tier = faker.helpers.arrayElement(this.tiers);
            const category = faker.helpers.arrayElement(this.categories);
            
            // 70% chance to have a subcategory
            const subcategory = Math.random() < 0.7 
                ? faker.helpers.arrayElement(this.subcategories.filter(sc => sc.categoryId === category.id))
                : null;

            // Generate realistic amounts based on category
            let amount;
            const isCredit = Math.random() < 0.3; // 30% chance of credit (income)
            
            if (category.name === 'Revenus') {
                amount = faker.number.float({ min: 800, max: 2500, multipleOf: 0.01 });
            } else if (category.name === 'Logement') {
                amount = faker.number.float({ min: 400, max: 1200, multipleOf: 0.01 });
            } else if (category.name === 'Alimentation') {
                amount = faker.number.float({ min: 5, max: 200, multipleOf: 0.01 });
            } else if (category.name === 'Transport') {
                amount = faker.number.float({ min: 2, max: 100, multipleOf: 0.01 });
            } else {
                amount = faker.number.float({ min: 10, max: 500, multipleOf: 0.01 });
            }

            // For credits, keep positive amount; for debits, make negative
            const finalAmount = (isCredit || category.name === 'Revenus') ? amount : -amount;

            const movement = {
                dateMouvement: faker.date.between({ 
                    from: new Date(2023, 0, 1), 
                    to: new Date() 
                }).toISOString().split('T')[0],
                idCompte: account.idCompte,
                idTiers: tier.idTiers,
                idCategorie: category.id,
                idSousCategorie: subcategory ? subcategory.id : null,
                montant: finalAmount,
                typeMouvement: finalAmount >= 0 ? 'C' : 'D'
            };
            movements.push(movement);
        }

        // Insert movements in batches to avoid memory issues
        const batchSize = 100;
        for (let i = 0; i < movements.length; i += batchSize) {
            const batch = movements.slice(i, i + batchSize);
            const insertQuery = `
                INSERT INTO Mouvement (dateMouvement, idCompte, idTiers, idCategorie, idSousCategorie, montant, typeMouvement)
                VALUES ?
            `;
            
            const values = batch.map(movement => [
                movement.dateMouvement, movement.idCompte, movement.idTiers,
                movement.idCategorie, movement.idSousCategorie, movement.montant, movement.typeMouvement
            ]);

            await this.connection.query(insertQuery, [values]);
        }

        console.log(`✅ Generated ${count} movements`);
    }

    // Generate transfers
    async generateVirements(count = 200) {
        console.log(`🔄 Generating ${count} transfers...`);
        const virements = [];

        for (let i = 0; i < count; i++) {
            const debitAccount = faker.helpers.arrayElement(this.accounts);
            let creditAccount;
            
            // Ensure different accounts for transfer
            do {
                creditAccount = faker.helpers.arrayElement(this.accounts);
            } while (creditAccount.idCompte === debitAccount.idCompte);

            const amount = faker.number.float({ min: 50, max: 1000, multipleOf: 0.01 });
            const tier = faker.helpers.arrayElement(this.tiers);
            const category = faker.helpers.arrayElement(this.categories);

            const virement = {
                idCompteDebit: debitAccount.idCompte,
                idCompteCredit: creditAccount.idCompte,
                montant: amount,
                dateVirement: faker.date.between({ 
                    from: new Date(2023, 0, 1), 
                    to: new Date() 
                }).toISOString().split('T')[0],
                idTiers: tier.idTiers,
                idCategorie: category.id
            };
            virements.push(virement);
        }

        const insertQuery = `
            INSERT INTO Virement (idCompteDebit, idCompteCredit, montant, dateVirement, idTiers, idCategorie)
            VALUES ?
        `;
        
        const values = virements.map(virement => [
            virement.idCompteDebit, virement.idCompteCredit, virement.montant,
            virement.dateVirement, virement.idTiers, virement.idCategorie
        ]);

        await this.connection.query(insertQuery, [values]);
        console.log(`✅ Generated ${count} transfers`);
    }

    // Main generation method
    async generateAllData(options = {}) {
        const config = {
            users: 50,
            tiersCount: 100,
            accountsPerUser: 2,
            movements: 2000,
            transfers: 200,
            ...options
        };

        console.log('🚀 Starting data generation...');
        console.log('Configuration:', config);

        try {
            await this.connect();
            
            await this.generateUsers(config.users);
            await this.generateCategories();
            await this.generateTiers(config.tiersCount);
            await this.generateAccounts(config.accountsPerUser);
            await this.generateMovements(config.movements);
            await this.generateVirements(config.transfers);

            console.log('🎉 Data generation completed successfully!');
            
            // Display summary
            const [accountsCount] = await this.connection.query('SELECT COUNT(*) as count FROM Compte');
            const [movementsCount] = await this.connection.query('SELECT COUNT(*) as count FROM Mouvement');
            const [transfersCount] = await this.connection.query('SELECT COUNT(*) as count FROM Virement');
            
            console.log('\n📊 Generation Summary:');
            console.log(`Users: ${config.users}`);
            console.log(`Accounts: ${accountsCount[0].count}`);
            console.log(`Categories: ${this.categories.length}`);
            console.log(`Subcategories: ${this.subcategories.length}`);
            console.log(`Third parties: ${this.tiers.length}`);
            console.log(`Movements: ${movementsCount[0].count}`);
            console.log(`Transfers: ${transfersCount[0].count}`);

        } catch (error) {
            console.error('❌ Error during data generation:', error);
            throw error;
        } finally {
            await this.disconnect();
        }
    }
}

async function main() {
    const generator = new BankDataGenerator();
    
    try {
        console.time('Data Generation');
        await generator.generateAllData({
            users: 75,           // Number of users
            tiersCount: 150,     // Number of third parties
            accountsPerUser: 3,  // Accounts per user
            movements: 8000,     // Number of movements
            transfers: 500       // Number of transfers
        });
        console.timeEnd('Data Generation');
    } catch (error) {
        console.error('❌ Failed to generate data:', error);
        process.exit(1);
    }
}

// Run the generator
if (require.main === module) {
    main();
}

module.exports = BankDataGenerator;