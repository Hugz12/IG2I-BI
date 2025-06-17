const mysql = require('mysql2/promise');

// --- CONFIGURATION ---
// Affiche les messages pour suivre l'exécution du script.
const log = (level, message) => console.log(`[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`);

// Informations de connexion pour la base de données SOURCE (Transactionnelle)
const API_DB_CONFIG = {
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: 'votre_mot_de_passe_source',
    database: 'api-db',
    connectionLimit: 10
};

// Informations de connexion pour la base de données DESTINATION (Data Warehouse)
const DATA_DB_CONFIG = {
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: 'votre_mot_de_passe_destination',
    database: 'data-db',
    connectionLimit: 10,
    // Permet plusieurs requêtes dans un seul appel query, utile pour les TRUNCATE.
    multipleStatements: true 
};


async function extractData(pool) {
    log('info', '--- DÉBUT DE L\'EXTRACTION ---');
    const sourceData = {};
    const tablesToExtract = [
        "Utilisateur", "Compte", "Categorie", "SousCategorie",
        "Tiers", "Mouvement", "FaitSoldeCompte"
    ];

    for (const table of tablesToExtract) {
        try {
            log('info', `Extraction de la table : ${table}`);
            const [rows] = await pool.query(`SELECT * FROM ??;`, [table]);
            sourceData[table] = rows;
        } catch (error) {
            log('error', `Erreur lors de l'extraction de la table ${table}: ${error.message}`);
            throw error; // Arrête le script si une table ne peut être lue
        }
    }
    
    log('info', '--- FIN DE L\'EXTRACTION ---');
    return sourceData;
}

function transformData(sourceData) {
    log('info', '--- DÉBUT DE LA TRANSFORMATION ---');

    // 1. Dimensions directes (aucune transformation nécessaire, juste une référence)
    const dimUtilisateur = sourceData.Utilisateur;
    const dimCompte = sourceData.Compte;
    const dimCategorie = sourceData.Categorie;
    const dimSousCategorie = sourceData.SousCategorie;
    const dimTiers = sourceData.Tiers;
    const faitSoldeCompte = sourceData.FaitSoldeCompte;

    // 2. Création de DimTypeMouvement (dimension statique)
    log('info', 'Création de DimTypeMouvement.');
    const dimTypeMouvement = [
        { idTypeMouvement: 1, code: 'D', libelle: 'Débit' },
        { idTypeMouvement: 2, code: 'C', libelle: 'Crédit' }
    ];

    // 3. Création de DimTemps à partir des dates de mouvements
    log('info', 'Création de DimTemps.');
    // Utiliser un Set pour obtenir des dates uniques (format YYYY-MM-DD)
    const uniqueDateStrings = [...new Set(sourceData.Mouvement.map(m => m.dateMouvement.toISOString().split('T')[0]))];
    
    const dimTemps = uniqueDateStrings.map((dateStr, index) => {
        const date = new Date(dateStr);
        return {
            idTemps: index + 1,
            date: date,
            jour: date.getDate(),
            mois: date.getMonth() + 1, // getMonth() est 0-indexé
            annee: date.getFullYear(),
            trimestre: Math.floor(date.getMonth() / 3) + 1,
            // Obtenir le nom du jour directement en français
            jourSemaine: date.toLocaleDateString('fr-FR', { weekday: 'long' })
        };
    });
    // Pour les recherches rapides, créer un Map des dates vers les idTemps
    const dateToIdTempsMap = new Map(dimTemps.map(t => [t.date.toISOString().split('T')[0], t.idTemps]));

    // 4. Création de FaitMouvement
    log('info', 'Création de FaitMouvement.');
    const faitMouvement = sourceData.Mouvement.map(mouv => {
        const dateStr = mouv.dateMouvement.toISOString().split('T')[0];
        const typeMouv = dimTypeMouvement.find(t => t.code === mouv.typeMouvement);

        return {
            idMouvement: mouv.idMouvement,
            idTemps: dateToIdTempsMap.get(dateStr),
            idCompte: mouv.idCompte,
            idTiers: mouv.idTiers,
            idCategorie: mouv.idCategorie,
            idSousCategorie: mouv.idSousCategorie,
            idTypeMouvement: typeMouv ? typeMouv.idTypeMouvement : null,
            montant: mouv.montant
        };
    });

    log('info', '--- FIN DE LA TRANSFORMATION ---');
    return {
        DimUtilisateur: dimUtilisateur,
        DimCompte: dimCompte,
        DimCategorie: dimCategorie,
        DimSousCategorie: dimSousCategorie,
        DimTiers: dimTiers,
        DimTypeMouvement: dimTypeMouvement,
        DimTemps: dimTemps,
        FaitMouvement: faitMouvement,
        FaitSoldeCompte: faitSoldeCompte
    };
}


async function loadData(pool, dataToLoad) {
    log('info', '--- DÉBUT DU CHARGEMENT ---');
    const connection = await pool.getConnection();

    try {
        log('info', 'Désactivation des contraintes de clés étrangères.');
        await connection.query('SET FOREIGN_KEY_CHECKS = 0;');
        
        const loadOrder = [
            'DimUtilisateur', 'DimTemps', 'DimCategorie', 'DimSousCategorie', 
            'DimTiers', 'DimCompte', 'DimTypeMouvement', 'FaitMouvement', 'FaitSoldeCompte'
        ];

        // Vidage des tables (dans l'ordre inverse pour éviter des problèmes potentiels)
        for (const tableName of [...loadOrder].reverse()) {
            log('info', `Vidage de la table : ${tableName}`);
            await connection.query('TRUNCATE TABLE ??;', [tableName]);
        }
        
        // Chargement des données (dans le bon ordre)
        for (const tableName of loadOrder) {
            const data = dataToLoad[tableName];
            if (data && data.length > 0) {
                log('info', `Chargement de ${data.length} lignes dans la table : ${tableName}`);
                // Prépare la requête pour l'insertion en masse
                const columns = Object.keys(data[0]);
                const values = data.map(row => columns.map(col => row[col]));
                const sql = `INSERT INTO ?? (??) VALUES ?`;
                await connection.query(sql, [tableName, columns, values]);
            } else {
                log('info', `Aucune donnée à charger pour la table : ${tableName}`);
            }
        }

        log('info', 'Réactivation des contraintes de clés étrangères.');
        await connection.query('SET FOREIGN_KEY_CHECKS = 1;');
    } catch (error) {
        log('error', `Erreur lors du chargement : ${error.message}`);
        throw error;
    } finally {
        if (connection) connection.release(); // Libère la connexion pour le pool
        log('info', '--- FIN DU CHARGEMENT ---');
    }
}


async function main() {
    log('info', 'Lancement du script ETL de api-db vers data-db.');
    let apiDbPool;
    let dataDbPool;

    try {
        // Création des pools de connexion
        apiDbPool = mysql.createPool(API_DB_CONFIG);
        dataDbPool = mysql.createPool(DATA_DB_CONFIG);
        log('info', 'Pools de connexions aux bases de données créés.');

        // 1. Extraire
        const sourceData = await extractData(apiDbPool);
        
        // 2. Transformer
        const transformedData = transformData(sourceData);
        
        // 3. Charger
        await loadData(dataDbPool, transformedData);
        
        log('info', 'Script ETL terminé avec succès.');

    } catch (error) {
        log('error', `Le script ETL a échoué : ${error.message}`);
    } finally {
        // Fermeture des pools de connexion
        if (apiDbPool) await apiDbPool.end();
        if (dataDbPool) await dataDbPool.end();
        log('info', 'Pools de connexions fermés.');
    }
}

// Lancement du script
main();
