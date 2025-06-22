# Projet

Projet IG2I BI

## Installation

Créer le fichier .env avec ces informations :
```sh
DATABASE_HOST=localhost
DATABASE_USER=IG2I
DATABASE_PASSWORD=motdepasse
DATABASE_NAME=money
DATABASE_PORT=3306
```

Executer ces commandes :
```sh
podman-compose up -d
npm install
npm run start
```

Done Table faitsoldecompte
1 ligne par jour (même si aucun mouvement)
-> Date du premier mouvement jusqu'à aujourd'hui

FaitSoldeCompte
-> Récupérer le solde initial et créer une ligne à la date de création du compte
-> A partir de cette date il faut créer une ligne par jour qui possedera le même solde, jusqu'à ce qu'il y ait un mouvement où on mettre à jour le solde qui restera le même dans les jour suivants 
/!\ Multiples mouvements le même jour


Jour 1 -> Création du compte
-> Création de la ligne j2 à partir J-1
-> Création de la ligne J3 à partir J-1
J3 -> Trigger movements
J3 -> met à jour la ligne (compte)
J4 -> Creation à partir J-1

Crea


J0 - crea

J1 
J2 - Movement bière - 10



JJ - mtn








J0 - Creat 0
J1 - 


UPDATE * WHERE date > AND COMPTA 



J0 -> JJ

```
INSERT INTO FaitSoldeCompte (idTemps, date, jour, mois, trimestre, annee, jourSemaine)
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
```