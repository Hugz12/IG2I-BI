CREATE TABLE DimTemps (
    idTemps INT PRIMARY KEY,
    date DATE NOT NULL,
    jour INT NOT NULL,
    mois INT NOT NULL,
    trimestre INT NOT NULL,
    annee INT NOT NULL,
    jourSemaine VARCHAR(20)
);

CREATE TABLE DimCompte (
    idCompte INT PRIMARY KEY,
    description VARCHAR(255),
    nomBanque VARCHAR(100),
    idUtilisateur INT
);

CREATE TABLE DimTiers (
    idTiers INT PRIMARY KEY,
    nomTiers VARCHAR(100),
    ville VARCHAR(100),
    codePostal CHAR(10)
);

CREATE TABLE DimCategorie (
    idCategorie INT PRIMARY KEY,
    nomCategorie VARCHAR(100)
);

CREATE TABLE DimSousCategorie (
    idSousCategorie INT PRIMARY KEY,
    nomSousCategorie VARCHAR(100),
    idCategorie INT,
    FOREIGN KEY (idCategorie) REFERENCES DimCategorie(idCategorie)
);

CREATE TABLE DimTypeMouvement (
    idTypeMouvement INT PRIMARY KEY,
    code CHAR(10),
    libelle VARCHAR(100)
);

CREATE TABLE FaitMouvement (
    idMouvement INT PRIMARY KEY,
    idTemps INT NOT NULL,
    idCompte INT NOT NULL,
    idTiers INT,
    idCategorie INT,
    idSousCategorie INT,
    idTypeMouvement INT,
    montant DECIMAL(15,2) NOT NULL,
    FOREIGN KEY (idTemps) REFERENCES DimTemps(idTemps),
    FOREIGN KEY (idCompte) REFERENCES DimCompte(idCompte),
    FOREIGN KEY (idTiers) REFERENCES DimTiers(idTiers),
    FOREIGN KEY (idCategorie) REFERENCES DimCategorie(idCategorie),
    FOREIGN KEY (idSousCategorie) REFERENCES DimSousCategorie(idSousCategorie),
    FOREIGN KEY (idTypeMouvement) REFERENCES DimTypeMouvement(idTypeMouvement)
);

CREATE TABLE FaitSoldeCompte (
    idSolde INT PRIMARY KEY AUTO_INCREMENT,
    idTemps INT NOT NULL,
    idCompte INT NOT NULL,
    montantSolde DECIMAL(15,2) NOT NULL,
    FOREIGN KEY (idTemps) REFERENCES DimTemps(idTemps),
    FOREIGN KEY (idCompte) REFERENCES DimCompte(idCompte),
    UNIQUE KEY unique_compte_temps (idTemps, idCompte)
);



DELIMITER //

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
            SELECT idTemps INTO id_temps_courant FROM DimTemps WHERE date = date_courante LIMIT 1;
            SELECT idTemps INTO id_temps_prec FROM DimTemps WHERE date = DATE_SUB(date_courante, INTERVAL 1 DAY) LIMIT 1;

            -- Récupérer le solde de la veille
            SELECT IFNULL(montantSolde, 0) INTO solde_prec
            FROM FaitSoldeCompte
            WHERE idCompte = id_compte AND idTemps = id_temps_prec
            LIMIT 1;

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

            -- Insertion/mise à jour du solde du jour
            INSERT INTO FaitSoldeCompte(idTemps, idCompte, montantSolde)
            VALUES (id_temps_courant, id_compte, solde_prec + mouvements_jour)
            ON DUPLICATE KEY UPDATE 
            montantSolde = VALUES(montantSolde);

            SET date_courante = DATE_ADD(date_courante, INTERVAL 1 DAY);
        END WHILE;
    END LOOP;
    
    CLOSE curseur_comptes;
END //

DELIMITER ;