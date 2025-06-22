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