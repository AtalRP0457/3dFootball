// Modern Football (2024 / 2024-25): Brazil, Argentina, MLS, Liga MX, Saudi
// Pro League. Format: see modern-eng.ts. Lower-confidence than European
// squads (calendar-year seasons, frequent transfers); edit in-game.
import type { RosterSource } from '../../../types/db.ts';

const rosters: RosterSource = {
  fla: `Agustín Rossi|GK|76|1|ARG
Léo Ortiz|CB|74|3|BRA
Léo Pereira|CB|74|4|BRA|L
Fabrício Bruno|CB|74|15|BRA
David Luiz|CB|70|23|BRA|L
Guillermo Varela|RB|74|2|URU
Wesley França|RB|72|43|BRA
Ayrton Lucas|LB|72|6|BRA|L
Alex Sandro|LB|73|26|BRA|L
Erick Pulgar|CDM|74|5|CHI
Nicolás de la Cruz|CM|79|18|URU
Gerson|CM|77|8|BRA|L
Allan|CDM|71|21|BRA
Giorgian de Arrascaeta|CAM|80|14|URU|L
Gonzalo Plata|RW|74|50|ECU|L
Everton Cebolinha|LW|72|11|BRA
Bruno Henrique|LW|73|27|BRA
Pedro|ST|78|9|BRA
Michael|LW|70|30|BRA`,
  pal: `Weverton|GK|77|21|BRA
Marcelo Lomba|GK|69|42|BRA
Gustavo Gómez|CB|77|15|PAR
Murilo|CB|74|26|BRA
Vitor Reis|CB|70|36|BRA
Marcos Rocha|RB|70|2|BRA
Mayke|RB|71|12|BRA
Piquerez|LB|74|22|URU|L
Caio Paulista|LB|69|6|BRA|L
Aníbal Moreno|CDM|74|5|ARG
Richard Ríos|CM|75|27|COL
Zé Rafael|CM|73|8|BRA
Raphael Veiga|CAM|77|23|BRA|L
Maurício|CAM|72|18|BRA
Estêvão|RW|75|41|BRA|L|88
Felipe Anderson|LW|74|7|BRA
José Manuel López|ST|74|3|ARG
Rony|ST|71|10|BRA`,
  cor: `Hugo Souza|GK|73|1|BRA
Matheus Donelli|GK|67|32|BRA
André Ramalho|CB|72|5|BRA
Félix Torres|CB|74|3|ECU
Gustavo Henrique|CB|71|13|BRA
Fagner|RB|69|23|BRA
Matheuzinho|RB|70|2|BRA
Matheus Bidu|LB|69|21|BRA|L
Raniele|CDM|69|14|BRA
José Martínez|CDM|71|70|VEN
Alex Santana|CM|69|8|BRA
Charles|CM|69|28|BRA
Rodrigo Garro|CAM|75|10|ARG|L
Memphis Depay|ST|80|94|NED
Yuri Alberto|ST|74|9|BRA
Ángel Romero|ST|70|11|PAR
Talles Magno|LW|69|17|BRA
Wesley Gassova|LW|68|7|BRA`,
  spfc: `Rafael|GK|74|23|BRA
Jandrei|GK|69|93|BRA
Arboleda|CB|73|5|ECU
Alan Franco|CB|71|28|ARG
Sabino|CB|69|35|BRA
Rafinha|RB|69|13|BRA
Igor Vinícius|RB|69|2|BRA
Welington|LB|70|6|BRA|L
Luiz Gustavo|CDM|70|16|BRA
Pablo Maia|CM|71|29|BRA
Alisson|CM|71|25|BRA
Rodrigo Nestor|CM|69|11|BRA
Lucas Moura|CAM|76|7|BRA
Wellington Rato|RW|69|27|BRA
Ferreira|LW|70|47|BRA
Luciano|ST|72|10|BRA
Jonathan Calleri|ST|74|9|ARG
André Silva|ST|69|17|BRA`,
  flu: `Fábio|GK|72|1|BRA
Vitor Eudes|GK|65|98|BRA
Thiago Silva|CB|78|3|BRA
Thiago Santos|CB|70|44|BRA
Ignácio|CB|70|33|BRA
Samuel Xavier|RB|70|2|BRA
Guga|RB|68|23|BRA
Diogo Barbosa|LB|68|6|BRA|L
Facundo Bernal|CDM|69|5|URU
Martinelli|CM|71|8|BRA
Ganso|CAM|72|10|BRA|L
Lima|CM|70|45|BRA
Jhon Arias|RW|77|21|COL
Keno|LW|70|11|BRA
Kevin Serna|LW|69|90|COL
Germán Cano|ST|74|14|ARG
Kauã Elias|ST|67|9|BRA
Marcelo|LB|70|12|BRA|L`,
  boc: `Sergio Romero|GK|73|1|ARG
Leandro Brey|GK|67|12|ARG
Marcos Rojo|CB|71|6|ARG|L
Nicolás Figal|CB|70|4|ARG
Cristian Lema|CB|69|2|ARG
Luis Advíncula|RB|73|17|PER
Lautaro Blanco|LB|70|23|ARG|L
Frank Fabra|LB|69|18|COL|L
Pol Fernández|CM|70|8|ARG
Cristian Medina|CM|71|36|ARG
Kevin Zenón|LM|71|22|ARG|L
Ignacio Miramón|CDM|70|21|ARG
Exequiel Zeballos|LW|71|7|ARG
Lucas Janson|RW|68|11|ARG
Miguel Merentiel|ST|72|16|URU
Edinson Cavani|ST|73|10|URU
Milton Giménez|ST|70|9|ARG`,
  riv: `Franco Armani|GK|73|1|ARG
Jeremías Ledesma|GK|69|41|ARG
Germán Pezzella|CB|76|18|ARG
Paulo Díaz|CB|75|17|CHI
Leandro González Pírez|CB|70|14|ARG
Federico Gattoni|CB|68|28|ARG
Milton Casco|RB|69|20|ARG
Marcos Acuña|LB|75|21|ARG|L
Enzo Pérez|CDM|71|24|ARG
Rodrigo Villagra|CDM|70|23|ARG
Maximiliano Meza|CM|71|8|ARG
Manuel Lanzini|CAM|72|10|ARG
Franco Mastantuono|CAM|72|30|ARG|L
Ignacio Fernández|CM|71|26|ARG
Facundo Colidio|LW|72|11|ARG
Pablo Solari|RW|71|36|ARG
Miguel Borja|ST|74|9|COL
Sebastián Driussi|ST|73|15|ARG`,
  rac: `Gabriel Arias|GK|73|21|CHI
Facundo Cambeses|GK|69|25|ARG
Marco Di Cesare|CB|70|2|ARG
Agustín García Basso|CB|70|4|ARG
Santiago Sosa|CDM|71|6|ARG
Gastón Martirena|RB|70|34|URU
Gabriel Rojas|LB|69|3|ARG|L
Juan Nardoni|CM|71|5|ARG
Bruno Zuculini|CDM|69|8|ARG
Juan Fernando Quintero|CAM|74|10|COL|L
Roger Martínez|LW|71|11|COL
Maximiliano Salas|ST|71|7|ARG
Adrián Martínez|ST|72|9|ARG
Johan Carbonero|RW|69|22|COL
Agustín Almendra|CM|69|20|ARG
Facundo Mura|RB|68|13|ARG
Baltasar Rodríguez|CM|67|26|ARG
Santiago Solari|LW|68|28|ARG`,
  mia: `Drake Callender|GK|71|1|USA
Óscar Ustari|GK|67|19|ARG
Tomás Avilés|CB|69|6|ARG
Gonzalo Luján|CB|68|23|ARG
Serhiy Kryvtsov|CB|67|27|UKR
Marcelo Weigandt|RB|67|57|ARG
Julian Gressel|RB|68|24|USA
Jordi Alba|LB|76|18|ESP|L
Sergio Busquets|CDM|77|5|ESP
Federico Redondo|CM|68|42|ARG
Diego Gómez|CM|72|20|PAR
Benjamin Cremaschi|CM|67|30|USA
Lionel Messi|RW|88|10|ARG|L|80
Facundo Farías|LW|69|11|ARG
Robert Taylor|LW|67|16|FIN
Luis Suárez|ST|78|9|URU
Leonardo Campana|ST|68|8|ECU
Lawson Sunderland|CB|62|31|USA`,
  lag: `John McCarthy|GK|69|77|USA
Novak Mićović|GK|64|1|SRB
Maya Yoshida|CB|69|4|JPN
Jalen Neal|CB|67|24|USA
Emiro Garcés|CB|65|3|COL
Miki Yamane|RB|68|2|JPN
John Nelson|LB|65|14|USA|L
Edwin Cerrillo|CDM|66|5|USA
Gastón Brugman|CM|69|8|URU
Mark Delgado|CM|67|18|USA
Riqui Puig|CAM|74|10|ESP
Gabriel Pec|RW|72|11|BRA
Joseph Paintsil|LW|70|28|GHA
Dejan Joveljić|ST|70|9|SRB
Marco Reus|CAM|74|26|GER
Diego Fagúndez|CAM|67|7|URU
Christian Ramirez|ST|64|17|USA
Eriq Zavaleta|CB|64|15|SLV`,
  ame: `Luis Malagón|GK|72|1|MEX
Rodolfo Cota|GK|66|30|MEX
Igor Lichnovsky|CB|71|4|CHI
Sebastián Cáceres|CB|74|3|URU
Israel Reyes|CB|71|23|MEX
Kevin Álvarez|RB|69|5|MEX
Cristian Borja|LB|69|29|COL|L
Ramón Juárez|CB|68|32|MEX
Jonathan dos Santos|CM|70|6|MEX
Álvaro Fidalgo|CM|74|8|ESP
Richard Sánchez|CM|70|19|PAR
Diego Valdés|CAM|72|10|CHI
Alejandro Zendejas|RW|71|13|USA
Brian Rodríguez|LW|72|7|URU
Henry Martín|ST|72|21|MEX
Rodrigo Aguirre|ST|70|24|URU
Víctor Dávila|LW|71|14|CHI
Erick Sánchez|CAM|70|28|MEX`,
  hil: `Yassine Bounou|GK|84|37|MAR
Mohammed Al-Owais|GK|72|21|KSA
Kalidou Koulibaly|CB|80|3|SEN
Ali Al-Bulaihi|CB|70|5|KSA
Hassan Tambakti|CB|71|87|KSA
João Cancelo|RB|84|20|POR
Renan Lodi|LB|76|6|BRA|L
Yasser Al-Shahrani|LB|69|12|KSA|L
Rúben Neves|CDM|81|8|POR
Sergej Milinković-Savić|CM|82|22|SRB
Mohamed Kanno|CM|72|28|KSA
Nasser Al-Dawsari|CM|69|16|KSA
Malcom|RW|79|77|BRA|L
Salem Al-Dawsari|LW|74|29|KSA
Marcos Leonardo|ST|75|11|BRA
Aleksandar Mitrović|ST|80|9|SRB
Neymar|LW|83|10|BRA
Abdullah Al-Hamdan|ST|68|99|KSA`,
  nas: `Bento|GK|76|24|BRA
Nawaf Al-Aqidi|GK|69|36|KSA
Aymeric Laporte|CB|83|27|ESP|L
Mohamed Simakan|CB|78|3|FRA
Ali Lajami|CB|69|78|KSA
Sultan Al-Ghannam|RB|70|2|KSA
Alex Telles|LB|74|13|BRA|L
Marcelo Brozović|CDM|82|77|CRO
Otávio|CM|77|25|POR
Abdullah Al-Khaibari|CDM|69|19|KSA
Ayman Yahya|LW|68|23|KSA
Angelo Gabriel|RW|71|80|BRA
Sadio Mané|LW|83|10|SEN
Wesley|RW|69|11|BRA
Abdulrahman Ghareeb|RW|70|29|KSA
Cristiano Ronaldo|ST|86|7|POR
Talisca|CAM|76|94|BRA|L
Abdulmajeed Al-Sulaiheem|CM|66|8|KSA`,
  itt: `Predrag Rajković|GK|77|1|SRB
Abdullah Al-Mayouf|GK|66|23|KSA
Danilo Pereira|CB|76|2|POR
Ahmed Sharahili|CB|67|4|KSA
Hassan Kadesh|CB|66|5|KSA
Muhannad Al-Shanqeeti|RB|66|13|KSA
Mario Mitaj|LB|69|25|ALB|L
N'Golo Kanté|CDM|83|7|FRA
Fabinho|CDM|78|8|BRA
Houssem Aouar|CAM|74|10|ALG
Awad Al-Nashri|CM|65|16|KSA
Steven Bergwijn|LW|75|34|NED
Moussa Diaby|RW|78|11|FRA|L|93
Karim Benzema|ST|82|9|FRA
Abderrazak Hamdallah|ST|73|99|MAR
Saleh Al-Shehri|ST|70|17|KSA
Marwan Al-Sahafi|ST|68|21|KSA
Faisal Al-Ghamdi|CM|66|14|KSA`,
};

export default rosters;
