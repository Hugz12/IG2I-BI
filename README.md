# Projet IG2I - Informatique Décisionnelle 💼📊

## 📋 Description du Projet

Ce projet d'Informatique Décisionnelle (BI) consiste en la création d'un système complet de gestion et d'analyse de données bancaires personnelles. Il implémente une architecture complète ETL (Extract, Transform, Load) avec :

- **Base de données OLTP** : Système transactionnel pour les opérations bancaires quotidiennes
- **Base de données OLAP** : Entrepôt de données (Data Warehouse) pour l'analyse décisionnelle
- **Processus ETL** : Extraction, transformation et chargement des données
- **Génération de données** : Simulation de données bancaires réalistes

## 🏗️ Architecture du Système

### 📊 Modèle Dimensionnel (OLAP)

Le projet implémente un schéma en étoile avec :

#### Tables de Dimensions

- **DimTemps** : Dimension temporelle (date, jour, mois, trimestre, année)
- **DimCompte** : Dimension des comptes bancaires
- **DimTiers** : Dimension des tiers (commerçants, entreprises)
- **DimCategorie** : Dimension des catégories de transactions
- **DimSousCategorie** : Dimension des sous-catégories
- **DimTypeMouvement** : Dimension des types de mouvements

#### Tables de Faits

- **FaitMouvement** : Faits des mouvements bancaires
- **FaitSoldeCompte** : Faits des soldes quotidiens par compte

### 🔄 Base de Données OLTP

Le système transactionnel comprend :

- **Utilisateur** : Gestion des utilisateurs
- **Compte** : Comptes bancaires
- **Mouvement** : Transactions financières
- **Virement** : Virements entre comptes
- **Categorie/SousCategorie** : Classification des transactions
- **Tiers** : Entités externes

## 🚀 Installation et Configuration

### Prérequis

- Node.js (version 16+)
- Podman ou Docker

### 1. Configuration de l'environnement

Créer le fichier `.env` à la racine du projet :

```env
# Configuration base de données OLTP (API)
DATABASE_HOST=localhost
DATABASE_USER=IG2I
DATABASE_PASSWORD=motdepasse
DATABASE_NAME=money
DATABASE_API_PORT=3306

# Configuration base de données OLAP (Data Warehouse)
DATABASE_DATA_PORT=3307
```

### 2. Démarrage des services

```bash
# Démarrer les conteneurs de base de données
podman-compose up -d

# Installer les dépendances Node.js
npm install
```

### 3. Initialisation des données

```bash
# Générer les données de test dans la base OLTP
npm run data:generate

# Exécuter le processus ETL vers la base OLAP
npm run data:etl
```

## 📁 Structure du Projet

```
IG2I-BI/
├── 📄 init-db.sql              # Structure OLTP (base transactionnelle)
├── 📄 init-db-data.sql         # Structure OLAP (entrepôt de données)
├── 📄 db-filler.js             # Générateur de données de test
├── 📄 etl-script.js            # Processus ETL
├── 📄 podman-compose.yml       # Configuration des conteneurs
├── 📄 package.json             # Dépendances et scripts
├── 📁 db_data/                 # Données OLTP persistantes
├── 📁 db_files/                # Données OLAP persistantes
└── 📁 docs/                    # Documentation et diagrammes
```

## 🔧 Scripts Disponibles

| Script                  | Description                          |
| ----------------------- | ------------------------------------ |
| `npm run data:generate` | Génère des données de test réalistes |
| `npm run data:etl`      | Exécute le processus ETL             |

## 🎯 Fonctionnalités Principales

### 🏦 Génération de Données Bancaires

- **Utilisateurs** : 75 utilisateurs avec profils réalistes
- **Comptes** : 3 comptes par utilisateur en moyenne
- **Transactions** : 8000 mouvements diversifiés
- **Virements** : 500 virements inter-comptes
- **Catégories** : 8 catégories principales (Alimentation, Transport, Logement, etc.)

### 📈 Processus ETL

- **Extraction** : Récupération des données depuis la base OLTP
- **Transformation** : Nettoyage et enrichissement des données
- **Chargement** : Insertion dans l'entrepôt de données OLAP

### 📊 Analyses Possibles

- Évolution des soldes de comptes dans le temps
- Analyse des dépenses par catégorie
- Patterns de consommation par utilisateur
- Analyse temporelle des transactions
- Comparaison des habitudes bancaires

## 🌟 Points Techniques Avancés

### Dimension Temporelle

- Génération automatique des dates depuis la première transaction
- Calcul des trimestres et jours de la semaine
- Support de l'analyse temporelle complète

### Gestion des Soldes

- Calcul quotidien des soldes même sans mouvement
- Historisation complète des variations de solde
- Prise en compte des mouvements multiples par jour

### Triggers et Contraintes

- Mise à jour automatique des soldes via triggers
- Cohérence référentielle entre les tables
- Gestion automatique des virements

## 🎓 Objectifs Pédagogiques

Ce projet permet d'apprendre et de mettre en pratique :

- **Modélisation dimensionnelle** : Schéma en étoile
- **Processus ETL** : Extract, Transform, Load
- **Différences OLTP/OLAP** : Systèmes transactionnels vs analytiques
- **Génération de données** : Création de jeux de données réalistes
- **Analyse temporelle** : Gestion avancée des dimensions temporelles
- **Optimisation** : Techniques d'optimisation pour l'analyse
