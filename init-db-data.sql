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
    FOREIGN KEY (idCompte) REFERENCES DimCompte(idCompte)
);