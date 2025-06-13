-- Drop existing tables and views if they exist (for clean setup)
DROP VIEW IF EXISTS V_MOUVEMENT;
DROP VIEW IF EXISTS V_CATEGORIE;
DROP TABLE IF EXISTS Mouvement;
DROP TABLE IF EXISTS Virement;
DROP TABLE IF EXISTS SousCategorie;
DROP TABLE IF EXISTS Categorie;
DROP TABLE IF EXISTS Tiers;
DROP TABLE IF EXISTS Compte;
DROP TABLE IF EXISTS Utilisateur;

-- Create tables
CREATE TABLE Categorie
(
    idCategorie       INT AUTO_INCREMENT PRIMARY KEY,
    nomCategorie      VARCHAR(50) NOT NULL,
    dateHeureCreation TIMESTAMP DEFAULT CURRENT_TIMESTAMP NULL,
    dateHeureMAJ      TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL ON UPDATE CURRENT_TIMESTAMP
);

-- Create trigger for Categorie
DELIMITER //
CREATE TRIGGER TRG_BEFORE_UPDATE_CATEGORIE
    BEFORE UPDATE
    ON Categorie
    FOR EACH ROW
BEGIN
    SET NEW.dateHeureMAJ = CURRENT_TIMESTAMP;
END//
DELIMITER ;

CREATE TABLE SousCategorie
(
    idSousCategorie   INT AUTO_INCREMENT PRIMARY KEY,
    nomSousCategorie  VARCHAR(50) NOT NULL,
    idcategorie       INT NOT NULL,
    dateHeureCreation TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    dateHeureMAJ      TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT SousCategorie_Categorie_idCategorie_fk
        FOREIGN KEY (idcategorie) REFERENCES Categorie (idCategorie)
            ON DELETE CASCADE
);

DELIMITER //
CREATE TRIGGER TRG_BEFORE_UPDATE_SOUS_CATEGORIE
    BEFORE UPDATE
    ON SousCategorie
    FOR EACH ROW
BEGIN
    SET NEW.dateHeureMAJ = CURRENT_TIMESTAMP;
END//
DELIMITER ;

CREATE TABLE Utilisateur
(
    idUtilisateur     INT AUTO_INCREMENT PRIMARY KEY,
    nomUtilisateur    VARCHAR(50) NOT NULL,
    prenomUtilisateur VARCHAR(50) NOT NULL,
    login             VARCHAR(50) NOT NULL,
    mdp               VARCHAR(256) NULL,
    hashcode          VARCHAR(128) NULL,
    dateHeureCreation TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    dateHeureMAJ      TIMESTAMP DEFAULT CURRENT_TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
    ville             VARCHAR(50) NULL,
    codePostal        CHAR(5) NULL
);

CREATE TABLE Compte
(
    idCompte          INT AUTO_INCREMENT PRIMARY KEY,
    descriptionCompte VARCHAR(50) NOT NULL,
    nomBanque         VARCHAR(50) NOT NULL,
    idUtilisateur     INT NOT NULL,
    dateHeureCreation TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    dateHeureMAJ      TIMESTAMP DEFAULT CURRENT_TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
    soldeInitial      DECIMAL(8, 2) DEFAULT 0.00 NOT NULL,
    dernierSolde      DECIMAL(8, 2) DEFAULT 0.00 NOT NULL,
    CONSTRAINT Compte_Utilisateur_idUtilisateur_fk
        FOREIGN KEY (idUtilisateur) REFERENCES Utilisateur (idUtilisateur)
            ON DELETE CASCADE
);

DELIMITER //
CREATE TRIGGER TRG_BEFORE_UPDATE_COMPTE
    BEFORE UPDATE
    ON Compte
    FOR EACH ROW
BEGIN
    SET NEW.dateHeureMAJ = CURRENT_TIMESTAMP;
END//
DELIMITER ;

CREATE TABLE Tiers
(
    idTiers           INT AUTO_INCREMENT PRIMARY KEY,
    nomTiers          VARCHAR(50) NOT NULL,
    dateHeureCreation TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    dateHeureMAJ      TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL ON UPDATE CURRENT_TIMESTAMP,
    idUtilisateur     INT DEFAULT 1 NOT NULL,
    CONSTRAINT Tiers_Utilisateur_idUtilisateur_fk
        FOREIGN KEY (idUtilisateur) REFERENCES Utilisateur (idUtilisateur)
);

DELIMITER //
CREATE TRIGGER TRG_BEFORE_UPDATE_TIERS
    BEFORE UPDATE
    ON Tiers
    FOR EACH ROW
BEGIN
    SET NEW.dateHeureMAJ = CURRENT_TIMESTAMP;
END//
DELIMITER ;

DELIMITER //
CREATE TRIGGER TRG_BEFORE_UPDATE_UTILISATEUR
    BEFORE UPDATE
    ON Utilisateur
    FOR EACH ROW
BEGIN
    SET NEW.dateHeureMAJ = CURRENT_TIMESTAMP;
END//
DELIMITER ;

CREATE TABLE Virement
(
    idVirement        INT AUTO_INCREMENT PRIMARY KEY,
    idCompteDebit     INT NOT NULL,
    idCompteCredit    INT NOT NULL,
    montant           DECIMAL(8, 2) DEFAULT 0.00 NOT NULL,
    dateVirement      DATE DEFAULT (CURDATE()) NOT NULL,
    dateHeureCreation TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    dateHeureMAJ      TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL ON UPDATE CURRENT_TIMESTAMP,
    idTiers           INT NULL,
    idCategorie       INT NULL,
    CONSTRAINT Virement_Compte_idCompte_fk
        FOREIGN KEY (idCompteDebit) REFERENCES Compte (idCompte),
    CONSTRAINT Virement_Compte_idCompte_fk_2
        FOREIGN KEY (idCompteCredit) REFERENCES Compte (idCompte)
);

CREATE TABLE Mouvement
(
    idMouvement       INT AUTO_INCREMENT PRIMARY KEY,
    dateMouvement     DATE DEFAULT (CURDATE()) NOT NULL,
    idCompte          INT NOT NULL,
    idTiers           INT DEFAULT 1 NULL,
    idCategorie       INT DEFAULT 1 NULL,
    idSousCategorie   INT NULL,
    idVirement        INT NULL,
    montant           DECIMAL(8, 2) NULL,
    typeMouvement     CHAR(1) DEFAULT 'D' NULL,
    dateHeureCreation TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    dateHeureMAJ      TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT Mouvement_Categorie_idCategorie_fk
        FOREIGN KEY (idCategorie) REFERENCES Categorie (idCategorie),
    CONSTRAINT Mouvement_SousCategorie_idSousCategorie_fk
        FOREIGN KEY (idSousCategorie) REFERENCES SousCategorie (idSousCategorie)
            ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT Mouvement_Tiers_idTiers_fk
        FOREIGN KEY (idTiers) REFERENCES Tiers (idTiers),
    CONSTRAINT Mouvement_Virement_idVirement_fk
        FOREIGN KEY (idVirement) REFERENCES Virement (idVirement)
            ON UPDATE CASCADE ON DELETE SET NULL
);

DELIMITER //
CREATE TRIGGER TRG_BEFORE_INSERT_MOUVEMENT
    BEFORE INSERT
    ON Mouvement
    FOR EACH ROW
BEGIN
    DECLARE v_Categorie INT DEFAULT 0;

    /* Il faut vérifier que la sous-catégorie appartient bien à la catégorie */
    IF NEW.idSousCategorie IS NOT NULL THEN
        SELECT idCategorie INTO v_Categorie FROM SousCategorie WHERE idSousCategorie = NEW.idSousCategorie;
        IF v_Categorie <> NEW.idCategorie THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'La sous-catégorie n''appartient pas à la catégorie choisie';
        END IF;
    END IF;
    SET NEW.dateHeureMAJ = CURRENT_TIMESTAMP;
END//
DELIMITER ;

DELIMITER //
CREATE TRIGGER TRG_AFTER_DELETE_VIREMENT
    AFTER DELETE
    ON Virement
    FOR EACH ROW
BEGIN
    DELETE FROM Mouvement WHERE idVirement = OLD.idVirement;
END//
DELIMITER ;

DELIMITER //
CREATE TRIGGER TRG_AFTER_INSERT
    AFTER INSERT
    ON Virement
    FOR EACH ROW
BEGIN
    /* Il faut insérer deux mouvements correspondant à ce virement inter-comptes */
    /* un mouvement au débit sur le compte débité */
    /* Un mouvement au crédit sur le compte crédité */
    INSERT INTO Mouvement(idCompte,montant,typeMouvement,idVirement,dateMouvement) 
    VALUES (NEW.idCompteDebit,(NEW.montant * -1),'D',NEW.idVirement,NEW.dateVirement);
    
    INSERT INTO Mouvement(idCompte,montant,typeMouvement,idVirement,dateMouvement) 
    VALUES (NEW.idCompteCredit,NEW.montant, 'C',NEW.idVirement,NEW.dateVirement);
END//
DELIMITER ;

DELIMITER //
CREATE TRIGGER TRG_BEFORE_UPDATE_VIREMENT
    BEFORE UPDATE
    ON Virement
    FOR EACH ROW
BEGIN
    SET NEW.dateHeureMAJ = CURRENT_TIMESTAMP;
END//
DELIMITER ;

-- Create views
CREATE VIEW V_CATEGORIE AS
SELECT c.nomCategorie AS nomCategorie, 
       sc.nomSousCategorie AS nomSousCategorie
FROM Categorie c
JOIN SousCategorie sc ON sc.idcategorie = c.idCategorie
ORDER BY c.nomCategorie, sc.nomSousCategorie;

CREATE VIEW V_MOUVEMENT AS
SELECT m.idMouvement AS idMouvement,
       m.dateMouvement AS dateMouvement,
       c.descriptionCompte AS descriptionCompte,
       c.nomBanque AS nomBanque,
       t.nomTiers AS nomTiers,
       ctg.nomCategorie AS nomCategorie,
       sctg.nomSousCategorie AS nomSousCategorie,
       m.montant AS montant
FROM Mouvement m
JOIN Compte c ON m.idCompte = c.idCompte
JOIN Tiers t ON m.idTiers = t.idTiers
JOIN Categorie ctg ON m.idCategorie = ctg.idCategorie
LEFT JOIN SousCategorie sctg ON m.idSousCategorie = sctg.idSousCategorie
ORDER BY m.dateMouvement;

-- Trigger sur la table mouvement pour mettre à jour le solde du compte
DELIMITER //
CREATE TRIGGER TRG_AFTER_INSERT_MOUVEMENT
    AFTER INSERT
    ON Mouvement
    FOR EACH ROW
BEGIN
    DECLARE v_solde DECIMAL(8, 2);
    
    /* Mettre à jour le solde du compte concerné */
    SELECT dernierSolde INTO v_solde FROM Compte WHERE idCompte = NEW.idCompte;
    
    IF NEW.typeMouvement = 'D' THEN
        SET v_solde = v_solde - NEW.montant;
    ELSEIF NEW.typeMouvement = 'C' THEN
        SET v_solde = v_solde + NEW.montant;
    END IF;

    UPDATE Compte SET dernierSolde = v_solde WHERE idCompte = NEW.idCompte;
END//
DELIMITER ;

DELIMITER //
CREATE TRIGGER TRG_AFTER_UPDATE_MOUVEMENT
    AFTER UPDATE
    ON Mouvement
    FOR EACH ROW
BEGIN
    DECLARE v_solde DECIMAL(8, 2);
    
    /* Mettre à jour le solde du compte concerné */
    SELECT dernierSolde INTO v_solde FROM Compte WHERE idCompte = NEW.idCompte;
    
    IF OLD.typeMouvement = 'D' THEN
        SET v_solde = v_solde + OLD.montant;
    ELSEIF OLD.typeMouvement = 'C' THEN
        SET v_solde = v_solde - OLD.montant;
    END IF;

    IF NEW.typeMouvement = 'D' THEN
        SET v_solde = v_solde - NEW.montant;
    ELSEIF NEW.typeMouvement = 'C' THEN
        SET v_solde = v_solde + NEW.montant;
    END IF;

    UPDATE Compte SET dernierSolde = v_solde WHERE idCompte = NEW.idCompte;
END//
DELIMITER ;
DELIMITER //
CREATE TRIGGER TRG_AFTER_DELETE_MOUVEMENT
    AFTER DELETE
    ON Mouvement
    FOR EACH ROW
BEGIN
    DECLARE v_solde DECIMAL(8, 2);
    
    /* Mettre à jour le solde du compte concerné */
    SELECT dernierSolde INTO v_solde FROM Compte WHERE idCompte = OLD.idCompte;
    
    IF OLD.typeMouvement = 'D' THEN
        SET v_solde = v_solde + OLD.montant;
    ELSEIF OLD.typeMouvement = 'C' THEN
        SET v_solde = v_solde - OLD.montant;
    END IF;

    UPDATE Compte SET dernierSolde = v_solde WHERE idCompte = OLD.idCompte;
END//
DELIMITER ;
