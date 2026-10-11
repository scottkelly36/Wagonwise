-- The starting set of OpenStreetMap places carried the note 'Lorry parking'. The wording is now 'HGV parking'.
-- Only the unedited OpenStreetMap rows are touched; a note someone has typed is left alone.
update parking.safe_parking_spots
   set note = 'HGV parking'
 where source = 'osm' and note = 'Lorry parking';
