// Modern Football roster profile: 2024-25 squads at the start of the season.
// Line format: Name|Position|Overall|Shirt|Nationality|Foot(L/R, default R)|Pace(optional)
// Ratings are this game's own estimates on a 1-99 scale (not EA data); edit
// them in the in-game Player Database.
import type { RosterSource } from '../../../types/db.ts';

const rosters: RosterSource = {
  mun: `André Onana|GK|83|24|CMR
Altay Bayındır|GK|73|1|TUR
Lisandro Martínez|CB|84|6|ARG|L
Matthijs de Ligt|CB|83|4|NED
Harry Maguire|CB|78|5|ENG
Leny Yoro|CB|76|15|FRA
Diogo Dalot|RB|81|20|POR
Noussair Mazraoui|RB|80|3|MAR
Luke Shaw|LB|80|23|ENG|L
Casemiro|CDM|80|18|BRA
Manuel Ugarte|CDM|81|25|URU
Kobbie Mainoo|CM|80|37|ENG
Bruno Fernandes|CAM|87|8|POR
Mason Mount|CAM|77|7|ENG
Alejandro Garnacho|LW|80|17|ARG|R|91
Amad Diallo|RW|77|16|CIV|L
Marcus Rashford|LW|80|10|ENG|R|90
Rasmus Højlund|ST|78|9|DEN
Joshua Zirkzee|ST|77|11|NED`,
  mci: `Ederson|GK|88|31|BRA|L
Stefan Ortega|GK|80|18|GER
Rúben Dias|CB|89|3|POR
John Stones|CB|85|5|ENG
Joško Gvardiol|CB|85|24|CRO|L
Manuel Akanji|CB|84|25|SUI
Nathan Aké|CB|83|6|NED|L
Kyle Walker|RB|84|2|ENG|R|86
Rico Lewis|RB|76|82|ENG
Rodri|CDM|91|16|ESP
Mateo Kovačić|CM|83|8|CRO
İlkay Gündoğan|CM|84|19|GER
Kevin De Bruyne|CAM|90|17|BEL
Bernardo Silva|CAM|88|20|POR|L
Phil Foden|RW|88|47|ENG|L
Jack Grealish|LW|83|10|ENG
Jérémy Doku|LW|81|11|BEL|R|93
Savinho|RW|79|26|BRA|L|90
Erling Haaland|ST|91|9|NOR|L|89`,
  liv: `Alisson Becker|GK|89|1|BRA
Caoimhín Kelleher|GK|79|62|IRL
Virgil van Dijk|CB|89|4|NED
Ibrahima Konaté|CB|83|5|FRA
Joe Gomez|CB|78|2|ENG
Jarell Quansah|CB|75|78|ENG
Trent Alexander-Arnold|RB|86|66|ENG
Andrew Robertson|LB|84|26|SCO|L
Kostas Tsimikas|LB|76|21|GRE|L
Ryan Gravenberch|CDM|81|38|NED
Alexis Mac Allister|CM|86|10|ARG
Dominik Szoboszlai|CM|81|8|HUN
Curtis Jones|CM|78|17|ENG
Harvey Elliott|CAM|76|19|ENG|L
Mohamed Salah|RW|89|11|EGY|L|89
Luis Díaz|LW|84|7|COL|R|90
Cody Gakpo|LW|82|18|NED
Diogo Jota|ST|83|20|POR
Darwin Núñez|ST|80|9|URU|R|90
Federico Chiesa|RW|79|14|ITA`,
  ars: `David Raya|GK|86|22|ESP
Neto|GK|75|32|BRA
William Saliba|CB|87|2|FRA
Gabriel Magalhães|CB|86|6|BRA|L
Jurriën Timber|RB|80|12|NED
Ben White|RB|83|4|ENG
Riccardo Calafiori|LB|80|33|ITA|L
Jakub Kiwior|CB|75|15|POL|L
Oleksandr Zinchenko|LB|78|17|UKR|L
Declan Rice|CDM|87|41|ENG
Thomas Partey|CDM|81|5|GHA
Jorginho|CM|78|20|ITA
Mikel Merino|CM|82|23|ESP|L
Martin Ødegaard|CAM|89|8|NOR|L
Bukayo Saka|RW|88|7|ENG|L|87
Gabriel Martinelli|LW|83|11|BRA|R|90
Leandro Trossard|LW|81|19|BEL
Raheem Sterling|LW|78|30|ENG
Kai Havertz|ST|83|29|GER|L
Gabriel Jesus|ST|80|9|BRA`,
  che: `Robert Sánchez|GK|79|1|ESP
Filip Jørgensen|GK|74|12|DEN
Levi Colwill|CB|79|6|ENG|L
Wesley Fofana|CB|79|29|FRA
Tosin Adarabioyo|CB|76|4|ENG
Benoît Badiashile|CB|76|5|FRA|L
Reece James|RB|81|24|ENG
Malo Gusto|RB|78|27|FRA
Marc Cucurella|LB|80|3|ESP|L
Moisés Caicedo|CDM|83|25|ECU
Roméo Lavia|CDM|76|45|BEL
Enzo Fernández|CM|83|8|ARG
Cole Palmer|CAM|86|20|ENG|L
Christopher Nkunku|CF|82|18|FRA
Noni Madueke|RW|78|11|ENG|L|88
Pedro Neto|RW|80|7|POR|L|89
Jadon Sancho|LW|78|19|ENG
Nicolas Jackson|ST|79|15|SEN|R|87
João Félix|CF|80|14|POR`,
  tot: `Guglielmo Vicario|GK|84|1|ITA
Fraser Forster|GK|72|20|ENG
Cristian Romero|CB|85|17|ARG
Micky van de Ven|CB|82|37|NED|L|94
Radu Drăgușin|CB|75|6|ROU
Pedro Porro|RB|82|23|ESP
Destiny Udogie|LB|79|13|ITA|L
Djed Spence|RB|72|24|ENG
Yves Bissouma|CDM|78|8|MLI
Rodrigo Bentancur|CM|80|30|URU
Pape Matar Sarr|CM|78|29|SEN
James Maddison|CAM|82|10|ENG
Dejan Kulusevski|RW|82|21|SWE|L
Son Heung-min|LW|86|7|KOR|R|86
Brennan Johnson|RW|78|22|WAL|R|88
Timo Werner|LW|75|16|GER
Dominic Solanke|ST|79|19|ENG
Richarlison|ST|77|9|BRA
Lucas Bergvall|CM|72|15|SWE`,
  new: `Nick Pope|GK|82|22|ENG
Martin Dúbravka|GK|76|1|SVK
Sven Botman|CB|80|4|NED|L
Fabian Schär|CB|80|5|SUI
Dan Burn|CB|76|33|ENG|L
Jamaal Lascelles|CB|74|6|ENG
Kieran Trippier|RB|80|2|ENG
Tino Livramento|RB|77|21|ENG
Lewis Hall|LB|76|20|ENG|L
Bruno Guimarães|CDM|85|39|BRA
Sandro Tonali|CM|81|8|ITA
Joelinton|CM|80|7|BRA
Sean Longstaff|CM|75|36|ENG
Joe Willock|CM|75|28|ENG
Anthony Gordon|LW|81|10|ENG|R|90
Harvey Barnes|LW|77|11|ENG
Jacob Murphy|RW|76|23|ENG
Alexander Isak|ST|85|14|SWE|R|88
Callum Wilson|ST|77|9|ENG`,
  avl: `Emiliano Martínez|GK|87|23|ARG
Robin Olsen|GK|71|25|SWE
Pau Torres|CB|81|14|ESP|L
Ezri Konsa|CB|80|4|ENG
Diego Carlos|CB|78|3|BRA
Tyrone Mings|CB|76|5|ENG|L
Matty Cash|RB|78|2|POL
Lucas Digne|LB|78|12|FRA|L
Ian Maatsen|LB|76|22|NED|L
Boubacar Kamara|CDM|81|44|FRA
Amadou Onana|CDM|80|24|BEL
Youri Tielemans|CM|81|8|BEL
John McGinn|CM|80|7|SCO|L
Morgan Rogers|CAM|77|27|ENG
Jacob Ramsey|CM|76|41|ENG
Leon Bailey|RW|79|31|JAM|L|92
Emiliano Buendía|CAM|77|10|ARG
Ollie Watkins|ST|84|11|ENG|R|86
Jhon Durán|ST|76|9|COL`,
  eve: `Jordan Pickford|GK|83|1|ENG|L
João Virgínia|GK|70|12|POR
James Tarkowski|CB|80|6|ENG
Jarrad Branthwaite|CB|79|32|ENG|L
Michael Keane|CB|74|5|ENG
Jake O'Brien|CB|72|15|IRL
Ashley Young|RB|73|18|ENG
Nathan Patterson|RB|72|2|SCO
Vitaliy Mykolenko|LB|76|19|UKR|L
Idrissa Gueye|CDM|76|27|SEN
Orel Mangala|CDM|74|8|BEL
James Garner|CM|75|37|ENG
Tim Iroegbunam|CM|70|42|ENG
Abdoulaye Doucouré|CM|76|16|MLI
Iliman Ndiaye|LW|76|10|SEN
Dwight McNeil|LW|77|7|ENG|L
Jack Harrison|RW|74|11|ENG|L
Dominic Calvert-Lewin|ST|76|9|ENG
Beto|ST|72|14|POR`,
  whu: `Alphonse Areola|GK|80|23|FRA
Łukasz Fabiański|GK|75|1|POL
Max Kilman|CB|78|26|ENG|L
Jean-Clair Todibo|CB|79|25|FRA
Konstantinos Mavropanos|CB|75|15|GRE
Aaron Wan-Bissaka|RB|78|29|ENG
Vladimír Coufal|RB|74|5|CZE
Emerson Palmieri|LB|76|33|ITA|L
Edson Álvarez|CDM|79|19|MEX
Tomáš Souček|CM|78|28|CZE
Guido Rodríguez|CDM|77|24|ARG
Lucas Paquetá|CAM|82|10|BRA|L
Carlos Soler|CM|76|4|ESP
Mohammed Kudus|RW|81|14|GHA|L|86
Jarrod Bowen|RW|83|20|ENG|L
Crysencio Summerville|LW|76|7|NED
Michail Antonio|ST|75|9|JAM
Niclas Füllkrug|ST|79|11|GER
Danny Ings|ST|73|18|ENG`,
  bha: `Bart Verbruggen|GK|77|1|NED
Jason Steele|GK|72|23|ENG
Lewis Dunk|CB|80|5|ENG
Jan Paul van Hecke|CB|78|29|NED
Igor Julio|CB|75|3|BRA|L
Adam Webster|CB|74|4|ENG
Joël Veltman|RB|75|34|NED
Tariq Lamptey|RB|73|2|GHA
Pervis Estupiñán|LB|79|30|ECU|L
Carlos Baleba|CDM|76|20|CMR
Mats Wieffer|CDM|76|27|NED
Jack Hinshelwood|CM|72|41|ENG
Yasin Ayari|CM|73|26|SWE
Georginio Rutter|CAM|76|14|FRA
Kaoru Mitoma|LW|81|22|JPN|R|86
Simon Adingra|LW|76|24|CIV|R|89
Yankuba Minteh|RW|74|17|GAM|L|90
João Pedro|ST|79|9|BRA
Danny Welbeck|ST|75|18|ENG
Evan Ferguson|ST|74|28|IRL`,
  bre: `Mark Flekken|GK|79|1|NED
Hákon Valdimarsson|GK|68|12|ISL
Nathan Collins|CB|77|22|IRL
Ethan Pinnock|CB|77|5|JAM|L
Kristoffer Ajer|CB|75|20|NOR
Sepp van den Berg|CB|74|4|NED
Mads Roerslev|RB|72|30|DEN
Keane Lewis-Potter|LB|73|23|ENG|L
Rico Henry|LB|73|3|ENG|L
Christian Nørgaard|CDM|77|6|DEN
Vitaly Janelt|CM|74|27|GER
Mathias Jensen|CM|76|8|DEN
Mikkel Damsgaard|CAM|76|24|DEN
Yehor Yarmoliuk|CM|70|18|UKR
Bryan Mbeumo|RW|81|19|CMR|L
Kevin Schade|LW|74|7|GER|R|91
Yoane Wissa|ST|78|11|COD
Igor Thiago|ST|72|9|BRA`,
  cry: `Dean Henderson|GK|79|1|ENG
Matt Turner|GK|73|30|USA
Marc Guéhi|CB|82|6|ENG
Maxence Lacroix|CB|78|5|FRA
Chris Richards|CB|74|26|USA
Trevoh Chalobah|CB|76|15|ENG
Daniel Muñoz|RB|78|12|COL
Tyrick Mitchell|LB|76|3|ENG|L
Adam Wharton|CM|77|20|ENG|L
Jefferson Lerma|CDM|76|8|COL
Cheick Doucouré|CDM|76|28|MLI
Will Hughes|CM|73|19|ENG|L
Eberechi Eze|CAM|82|10|ENG
Ismaïla Sarr|RW|76|7|SEN|R|91
Daichi Kamada|CAM|76|18|JPN
Jesurun Rak-Sakyi|RW|68|17|ENG
Jean-Philippe Mateta|ST|78|14|FRA
Eddie Nketiah|ST|75|9|ENG`,
  ful: `Bernd Leno|GK|81|1|GER
Steven Benda|GK|67|23|GER
Joachim Andersen|CB|80|5|DEN
Calvin Bassey|CB|76|3|NGA|L
Issa Diop|CB|74|31|FRA
Kenny Tete|RB|75|2|NED
Timothy Castagne|RB|75|21|BEL
Antonee Robinson|LB|79|33|USA|L|90
Sander Berge|CDM|76|16|NOR
Saša Lukić|CM|75|20|SRB
Harrison Reed|CM|73|6|ENG
Andreas Pereira|CAM|78|18|BRA
Emile Smith Rowe|CAM|76|32|ENG
Alex Iwobi|LW|78|17|NGA
Adama Traoré|RW|75|11|ESP|R|93
Harry Wilson|RW|74|8|WAL|L
Raúl Jiménez|ST|76|7|MEX
Rodrigo Muniz|ST|74|9|BRA`,
  wol: `José Sá|GK|79|1|POR
Sam Johnstone|GK|74|31|ENG
Toti Gomes|CB|74|24|POR|L
Santiago Bueno|CB|73|4|URU
Craig Dawson|CB|72|15|ENG
Yerson Mosquera|CB|72|14|COL
Nélson Semedo|RB|76|22|POR
Rayan Aït-Nouri|LB|78|3|ALG|L
Matt Doherty|RB|72|2|IRL
Mario Lemina|CDM|77|5|GAB
João Gomes|CM|77|8|BRA
André|CDM|75|7|BRA
Tommy Doyle|CM|70|20|ENG
Jean-Ricner Bellegarde|CAM|74|27|FRA
Matheus Cunha|CF|80|10|BRA
Hee-chan Hwang|LW|75|11|KOR
Gonçalo Guedes|RW|74|29|POR
Jørgen Strand Larsen|ST|76|9|NOR`,
  nfo: `Matz Sels|GK|79|26|BEL
Carlos Miguel|GK|70|33|BRA
Murillo|CB|79|40|BRA|L
Nikola Milenković|CB|80|31|SRB
Willy Boly|CB|72|30|CIV
Ola Aina|RB|76|34|NGA
Neco Williams|RB|74|3|WAL
Álex Moreno|LB|73|15|ESP|L
Elliot Anderson|CM|76|8|SCO
Ryan Yates|CDM|73|22|ENG
Nicolás Domínguez|CM|74|16|ARG
Ibrahim Sangaré|CDM|74|6|CIV
Morgan Gibbs-White|CAM|80|10|ENG
Anthony Elanga|RW|77|21|SWE|R|91
Callum Hudson-Odoi|LW|76|14|ENG
Ramón Sosa|LW|73|18|PAR
Chris Wood|ST|78|11|NZL
Taiwo Awoniyi|ST|73|9|NGA`,
  bou: `Kepa Arrizabalaga|GK|78|13|ESP
Mark Travers|GK|70|42|IRL
Illia Zabarnyi|CB|78|27|UKR
Marcos Senesi|CB|76|5|ARG|L
Dean Huijsen|CB|74|2|ESP
Chris Mepham|CB|71|6|WAL
Adam Smith|RB|71|15|ENG
Julián Araujo|RB|71|22|MEX
Milos Kerkez|LB|77|3|HUN|L
Tyler Adams|CDM|74|12|USA
Lewis Cook|CM|75|4|ENG
Ryan Christie|CM|74|10|SCO
Alex Scott|CM|73|8|ENG
Justin Kluivert|CAM|77|19|NED
Antoine Semenyo|RW|77|24|GHA|R|88
Marcus Tavernier|LW|76|16|ENG|L
Dango Ouattara|RW|74|11|BFA|R|90
Evanilson|ST|77|9|BRA
Enes Ünal|ST|73|26|TUR`,
  lei: `Mads Hermansen|GK|76|30|DEN
Daniel Iversen|GK|71|31|DEN
Wout Faes|CB|75|3|BEL
Jannik Vestergaard|CB|74|23|DEN
Conor Coady|CB|72|4|ENG
Caleb Okoli|CB|71|5|ITA
James Justin|RB|74|2|ENG
Ricardo Pereira|RB|75|21|POR
Victor Kristiansen|LB|72|16|DEN|L
Wilfred Ndidi|CDM|76|25|NGA
Harry Winks|CM|74|8|ENG
Oliver Skipp|CM|73|22|ENG
Boubakary Soumaré|CDM|73|24|FRA
Facundo Buonanotte|CAM|74|40|ARG|L
Stephy Mavididi|LW|75|10|ENG|L
Abdul Fatawu|RW|73|18|GHA|L|90
Bobby De Cordova-Reid|RW|72|14|JAM
Jamie Vardy|ST|76|9|ENG
Patson Daka|ST|72|20|ZAM`,
  sou: `Aaron Ramsdale|GK|78|30|ENG
Alex McCarthy|GK|70|1|ENG
Jan Bednarek|CB|73|35|POL
Taylor Harwood-Bellis|CB|73|21|ENG
Jack Stephens|CB|71|5|ENG
Nathan Wood|CB|69|15|ENG
Kyle Walker-Peters|RB|75|2|ENG
Yukinari Sugawara|RB|72|16|JPN
Charlie Taylor|LB|69|3|ENG|L
Flynn Downes|CDM|73|4|ENG
Lesley Ugochukwu|CDM|71|26|FRA
Joe Aribo|CM|72|7|NGA
Will Smallbone|CM|71|8|IRL
Mateus Fernandes|CM|70|18|POR
Kamaldeen Sulemana|LW|71|20|GHA|R|90
Tyler Dibling|RW|70|33|ENG|L
Adam Armstrong|ST|73|9|ENG
Ben Brereton Díaz|ST|71|17|CHI
Paul Onuachu|ST|72|32|NGA`,
  ips: `Arijanet Muric|GK|74|1|KOS
Christian Walton|GK|69|28|ENG
Jacob Greaves|CB|72|24|ENG|L
Luke Woolfenden|CB|70|6|ENG
Dara O'Shea|CB|73|26|IRL
Cameron Burgess|CB|69|15|AUS|L
Axel Tuanzebe|RB|71|40|COD
Ben Johnson|RB|70|18|ENG
Leif Davis|LB|74|3|ENG|L
Sam Morsy|CDM|74|5|EGY
Kalvin Phillips|CDM|74|8|ENG
Massimo Luongo|CM|70|25|AUS
Jens Cajuste|CM|72|12|SWE
Conor Chaplin|CAM|72|10|ENG
Omari Hutchinson|RW|74|20|JAM|L|88
Jack Clarke|LW|72|47|ENG
Wes Burns|RW|70|7|WAL
Liam Delap|ST|74|19|ENG
George Hirst|ST|69|27|SCO`,
};

export default rosters;
