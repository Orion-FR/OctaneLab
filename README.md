# OctaneLab

Calculateur de mix **E85 / essence** pour reservoir flex-fuel. Saisis la cible d'ethanol, la capacite du reservoir et le niveau actuel — l'app te dit combien de litres d'E85 et d'essence verser a la pompe pour atteindre exactement ton melange.

Mobile-first, dark theme, sans framework. Trois fichiers : `index.html`, `style.css`, `script.js`.

---

## Fonctionnalites

- **Cible ethanol** ajustable de 0 a 85% via slider
- **Niveau de jauge en barres** (stepper +/- et visualisation graphique)
- **Trois essences** : SP95, SP95-E10, SP98-E5
- **Saison automatique** : lit la date du jour et applique le bon taux d'ethanol pour l'E85
  - Ete (1er avril -> 31 octobre) : 85% d'ethanol
  - Hiver (1er novembre -> 31 mars) : 65% d'ethanol (norme EN 15293, allege en ethanol pour les demarrages a froid)
- **Presets vehicules** : BMW Z4 prechargee, ajout/edition/suppression libres, persistes en `localStorage`
- **Detection des cibles inatteignables** : avertit si le restant a deja trop ou pas assez d'ethanol pour atteindre la cible avec un simple complement

## Hypotheses de calcul

| Carburant   | Taux ethanol |
|-------------|--------------|
| SP95        | 0%           |
| SP95-E10    | 10%          |
| SP98-E5     | 5%           |
| E85 ete     | 85%          |
| E85 hiver   | 65%          |

L'app suppose que le carburant deja dans le reservoir est du meme type que celui selectionne (l'essence d'appoint). Pour un melange E85 + essence existant, ajuste le taux cible en consequence.

---

## Execution en local

Le projet est statique : aucune dependance, aucun build.

### 1. Double-clic
Ouvre `index.html` dans ton navigateur. C'est tout — `localStorage` fonctionne en `file://`.

### 2. Serveur Python (recommande pour tester sur mobile)
```bash
cd "/Users/paulr/Documents/Prog/Projets Web/OctaneLab"
python3 -m http.server 8000
```
- **PC** : http://localhost:8000
- **Mobile** (meme Wi-Fi) : recupere ton IP locale avec `ipconfig getifaddr en0` (macOS), puis va sur `http://<TON_IP>:8000` depuis ton telephone

`Ctrl+C` pour stopper.

### 3. `npx serve` (si tu as Node)
```bash
cd "/Users/paulr/Documents/Prog/Projets Web/OctaneLab"
npx serve
```
Affiche directement les URLs locale et reseau.

---

## Structure du projet

```
OctaneLab/
├── index.html      # markup + dialog presets
├── style.css       # theme sombre, mobile-first, responsive >=720px
├── script.js       # state + calcul + persistance localStorage
├── README.md
└── LICENSE
```

## Formule

Pour un reservoir de capacite `C`, `Br/Bt` barres restantes sur la jauge, essence d'appoint a `g%` d'ethanol et E85 a `e%` :

```
V_restant     = C * (Br / Bt)
V_a_ajouter   = C - V_restant
ethanol_actuel = V_restant * g
ethanol_cible  = C * cible

V_E85 = (ethanol_cible - ethanol_actuel - V_a_ajouter * g) / (e - g)
V_essence = V_a_ajouter - V_E85
```

## Licence

Voir [LICENSE](LICENSE).
